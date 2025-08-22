"""
API views для сканирования директории с переписсками и парсингом через LLM
"""
import os
import uuid
import time
import threading
from collections import Counter
from pathlib import Path
from datetime import datetime, date

from django.conf import settings
from django.db import transaction, close_old_connections
from django.utils import timezone

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status as drf_status

from .models import ScanJob 
from .serializers import ScanJobSerializer
from apps.production.models import Downtime, ProductionLine, PlanTask
from apps.notifications.models import Notification

from .services import LLMExtractionService


# ---------- ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ----------


def _safe_set_job(
    job_id, *, status=None, progress=None, message=None, results=None, completed=False
):
    """Быстрое и безопасное обновление полей ScanJob напрямую в БД (без гонок с in-memory экземпляром)."""
    updates = {}
    if status is not None:
        updates["status"] = status
    if progress is not None:
        updates["progress"] = float(progress)
    if message is not None:
        updates["message"] = message
    if results is not None:
        updates["results"] = results
    if completed:
        updates["completed_at"] = timezone.now()

    if updates:
        ScanJob.objects.filter(id=job_id).update(**updates)


def _list_documents(root: Path, allowed_ext: set[str]) -> list[Path]:
    docs: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # игнорим скрытые папки
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fname in filenames:
            if fname.startswith("."):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if not allowed_ext or ext in allowed_ext:
                docs.append(Path(dirpath) / fname)
    return docs


def _extract_text(path: Path) -> str:
    """
    Извлекает читабельный текст из файла:
    - .txt: читаем как utf-8, при ошибке — cp1251, иначе пропуск
    - .docx: через python-docx
    - .pdf: через pypdf
    При необходимости — подмените на свой парсер (pdfminer.six и пр.).
    """
    ext = path.suffix.lower()

    if ext == ".txt":
        for enc in ("utf-8", "cp1251"):
            try:
                return path.read_text(encoding=enc)
            except Exception:
                pass
        raise ValueError(f"Не удалось прочитать TXT (кодировка): {path.name}")

    if ext == ".docx":
        try:
            from docx import Document
        except Exception as e:
            raise RuntimeError("python-docx не установлен") from e
        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs)

    if ext == ".pdf":
        try:
            from pypdf import PdfReader
        except Exception as e:
            raise RuntimeError("pypdf не установлен") from e
        reader = PdfReader(str(path))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                parts.append("")
        return "\n".join(parts)

    # по умолчанию — пропуск
    raise ValueError(f"Неизвестное расширение: {ext}")


def _parse_date_ddmmyyyy(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%d-%m-%Y").date()
    except Exception:
        return None


def _save_extracted_downtimes_sync(downtimes_data: list, source_file: str):
    """
    Синхронное сохранение простоев.
    Возвращает (saved_list, skipped_list) где skipped_list — короткие записи о причинах пропуска.
    """
    import hashlib

    saved = []
    skipped = []

    for d in downtimes_data:
        try:
            # Линия
            line = None
            if d.get("line") and d["line"] != "unknown":
                line = ProductionLine.objects.filter(name=d["line"]).first()
                if not line:
                    skipped.append(
                        {
                            "reason": "unknown_line",
                            "source_file": source_file,
                            "raw": d,
                        }
                    )
                    continue

            # Даты
            start_dt = _parse_date_ddmmyyyy(d.get("start_date", ""))
            end_dt = _parse_date_ddmmyyyy(d.get("end_date", ""))

            if not start_dt or not end_dt:
                skipped.append(
                    {
                        "reason": "invalid_dates",
                        "source_file": source_file,
                        "raw": d,
                    }
                )
                continue

            # Хеш источника
            source_hash = hashlib.sha256(
                f"{d.get('evidence_quote', '')}_{source_file}".encode("utf-8")
            ).hexdigest()

            # Идемпотентность — не создаем дубликаты
            if Downtime.objects.filter(source_hash=source_hash).exists():
                skipped.append(
                    {
                        "reason": "duplicate",
                        "source_file": source_file,
                        "raw": d,
                    }
                )
                continue

            # Создаем запись
            downtime = Downtime.objects.create(
                line=line,
                start_dt=start_dt,
                end_dt=end_dt,
                status=d.get("status"),
                kind=d.get("kind"),
                source_file=source_file,
                evidence_quote=d.get("evidence_quote", ""),
                evidence_location=d.get("evidence_location", ""),
                confidence=d.get("confidence", 0.0),
                partial_date_start=d.get("partial_date_start", False),
                partial_date_end=d.get("partial_date_end", False),
                notes=d.get("notes", ""),
                extraction_version=d.get("extraction_version", "v1"),
                source_hash=source_hash,
                source="llm",
                sources_json=[
                    {
                        "source_file": source_file,
                        "evidence_quote": d.get("evidence_quote", ""),
                        "evidence_location": d.get("evidence_location", ""),
                        "source_hash": source_hash,
                    }
                ],
            )
            saved.append(downtime)

        except Exception as e:
            skipped.append(
                {
                    "reason": "exception",
                    "source_file": source_file,
                    "raw": {"error": str(e)},
                }
            )

    # ограничим размер списка skipped для вывода
    if len(skipped) > 20:
        skipped = skipped[:20] + [
            {
                "reason": "truncated",
                "source_file": source_file,
                "raw": {"count": len(skipped)},
            }
        ]

    return saved, skipped


def _detect_conflicts_sync(downtimes):
    """
    Ищет пересечения Downtime с задачами плана и создает Notification.
    Возвращает (detected_count, created_count)
    """
    import hashlib

    detected = 0
    created = 0

    for dt in downtimes:
        if not dt.line_id:
            continue

        overlapping = PlanTask.objects.select_related(
            "production_line", "product"
        ).filter(
            production_line_id=dt.line_id,
            start_dt__lte=dt.end_dt,
            end_dt__gte=dt.start_dt,
        )

        for task in overlapping:
            detected += 1

            overlap_start = max(task.start_dt, dt.start_dt)
            overlap_end = min(task.end_dt, dt.end_dt)

            text = (
                f"Обнаружен конфликт: задача '{task.title}' "
                f"пересекается с простоем {dt.kind or 'неизвестного типа'} "
                f"на линии {dt.line.name if dt.line else '-'} "
                f"с {overlap_start.strftime('%d-%m-%Y')} по {overlap_end.strftime('%d-%m-%Y')}"
            )

            payload = {
                "conflict_id": f"conflict_{task.id}_{dt.id}",
                "task_id": task.id,
                "downtime_id": dt.id,
                "line_id": dt.line_id,
                "line_name": dt.line.name if dt.line else "",
                "task_title": task.title,
                "overlap_start": overlap_start.strftime("%d-%m-%Y"),
                "overlap_end": overlap_end.strftime("%d-%m-%Y"),
                "downtime_confidence": dt.confidence,
                "downtime_source": dt.source_file or "",
                "priority_status": dt.status or "unknown",
            }

            unique_content = f"CONFLICT_DETECTED:task_{task.id}:downtime_{dt.id}"
            unique_key = hashlib.sha256(unique_content.encode("utf-8")).hexdigest()

            # создаем/находим уведомление
            _, was_created = Notification.objects.get_or_create(
                unique_key=unique_key,
                defaults={
                    "level": "warning",
                    "code": "CONFLICT_DETECTED",
                    "text": text,
                    "payload_json": payload,
                },
            )
            if was_created:
                created += 1

    return detected, created


def _run_extraction(
    extractor: LLMExtractionService,
    *,
    text: str,
    source_file: str,
    header_year: int | None = None,
    filename_year: int | None = None,
    planning_year: int | None = None,
):
    """
    Универсальный вызов LLM-сервиса (sync/async) с прокидыванием годов.
    """
    import inspect

    fn = extractor.extract_downtimes_from_text
    kwargs = dict(
        text=text,
        source_file=source_file,
        header_year=header_year,
        filename_year=filename_year,
        planning_year=planning_year,
    )
    if inspect.iscoroutinefunction(fn):
        import asyncio

        return asyncio.run(fn(**kwargs))
    return fn(**kwargs)


# ---------- ФОНОВЫЙ РАБОЧИЙ ПОТОК ----------


def _scan_job_worker(job_id: uuid.UUID, folder_path: str):
    """
    Фоновая обработка: обход ФС, парсинг, извлечение простоев, сохранение и конфликты.
    Запускать в отдельном потоке (daemon=True).
    """
    # в потоке нужно корректно управлять коннектами к БД
    close_old_connections()
    try:
        base_dir = Path(getattr(settings, "MINUTES_DIR", "/app/data/minutes")).resolve()
        target = Path(folder_path).resolve()
        allowed_ext = set(
            map(
                str.lower,
                getattr(settings, "MINUTES_ALLOWED_EXT", {".docx", ".pdf", ".txt"}),
            )
        )

        # валидация пути
        if not str(target).startswith(str(base_dir)):
            _safe_set_job(
                job_id,
                status=ScanJob.Status.FAILED,
                message="Запрошенный путь вне разрешенной директории",
                completed=True,
            )
            return
        if not target.exists() or not target.is_dir():
            _safe_set_job(
                job_id,
                status=ScanJob.Status.FAILED,
                message="Каталог не найден или не является директорией",
                completed=True,
            )
            return

        # статус RUNNING
        _safe_set_job(
            job_id,
            status=ScanJob.Status.RUNNING,
            progress=5.0,
            message=f"Поиск документов в {target}...",
        )

        # поиск файлов
        docs = _list_documents(target, allowed_ext)
        total = len(docs)

        if total == 0:
            results = {
                "documents_processed": 0,
                "by_extension": {},
                "downtimes_extracted": 0,
                "downtimes_saved": 0,
                "downtimes_skipped": [],
                "downtimes_found_total_in_db": Downtime.objects.count(),
                "conflicts_detected": 0,
                "conflicts_created": 0,
            }
            _safe_set_job(
                job_id,
                status=ScanJob.Status.COMPLETED,
                progress=100.0,
                message="Документы не найдены",
                results=results,
                completed=True,
            )
            return

        _safe_set_job(
            job_id, progress=20.0, message=f"Найдено документов: {total}. Обработка..."
        )

        # инициализация счётчиков
        by_ext = Counter()
        documents_processed = 0
        downtimes_extracted = 0
        saved_all = []
        skipped_all = []
        update_every = max(1, total // 10)

        extractor = LLMExtractionService()

        # ЭТАП: обработка файлов (20..70%)
        for idx, path in enumerate(docs, start=1):
            by_ext[path.suffix.lower()] += 1
            try:
                text = _extract_text(path)
                # LLM-извлечение
                result = _run_extraction(extractor, text=text, source_file=path.name)

                # Унификация результата
                success = getattr(result, "success", None)
                if success is None:
                    success = bool(result.get("success"))
                downtimes = getattr(result, "downtimes", None)
                if downtimes is None:
                    downtimes = result.get("downtimes", [])

                if success:
                    downtimes_extracted += len(downtimes)
                    saved, skipped = _save_extracted_downtimes_sync(
                        downtimes, source_file=path.name
                    )
                    saved_all.extend(saved)
                    skipped_all.extend(skipped)
                else:
                    skipped_all.append(
                        {
                            "reason": "extraction_failed",
                            "source_file": path.name,
                            "raw": {},
                        }
                    )

            except Exception as e:
                skipped_all.append(
                    {
                        "reason": "parse_error",
                        "source_file": path.name,
                        "raw": {"error": str(e)},
                    }
                )

            documents_processed += 1

            if documents_processed % update_every == 0:
                pct = 20.0 + 50.0 * (documents_processed / total)  # 20..70
                _safe_set_job(
                    job_id,
                    progress=pct,
                    message=f"Обработка документов... {documents_processed}/{total}",
                )
                time.sleep(0.05)  # чтобы UI видел движение

        # ЭТАП: анализ простоев (агрегация) 70..85
        _safe_set_job(job_id, progress=75.0, message="Анализ простоев...")

        # ЭТАП: поиск конфликтов 85..95
        _safe_set_job(
            job_id,
            progress=85.0,
            message="Поиск конфликтов между планом и простоями...",
        )
        conflicts_detected, conflicts_created = _detect_conflicts_sync(saved_all)

        # Финальные результаты
        results = {
            "documents_processed": documents_processed,
            "by_extension": dict(by_ext),
            "downtimes_extracted": downtimes_extracted,
            "downtimes_saved": len(saved_all),
            "downtimes_skipped": skipped_all[:20]
            if len(skipped_all) > 20
            else skipped_all,
            "downtimes_found_total_in_db": Downtime.objects.count(),
            "conflicts_detected": conflicts_detected,
            "conflicts_created": conflicts_created,
        }

        _safe_set_job(
            job_id,
            status=ScanJob.Status.COMPLETED,
            progress=100.0,
            message="Сканирование завершено успешно",
            results=results,
            completed=True,
        )

    except Exception as e:
        _safe_set_job(
            job_id, status=ScanJob.Status.FAILED, message=f"Ошибка: {e}", completed=True
        )
    finally:
        close_old_connections()


@api_view(["POST"])
def start_scan_job(request):
    """
    Старт сканирования: сохраняем ScanJob и запускаем фоновый поток.
    Возможный body: { "folder_path": "/app/data/minutes" } — опционально.
    """
    base_dir = Path(getattr(settings, "MINUTES_DIR", "/app/data/minutes")).resolve()
    folder_path = request.data.get("folder_path") or str(base_dir)
    target = Path(folder_path).resolve()

    # Защита от выхода за пределы разрешённого каталога
    if not str(target).startswith(str(base_dir)):
        return Response(
            {
                "success": False,
                "data": None,
                "error": {
                    "code": "INVALID_PATH",
                    "message": "Запрошенный путь вне разрешенной директории",
                    "details": {
                        "requested": str(target),
                        "allowed_root": str(base_dir),
                    },
                },
            },
            status=drf_status.HTTP_400_BAD_REQUEST,
        )

    if not target.exists() or not target.is_dir():
        return Response(
            {
                "success": False,
                "data": None,
                "error": {
                    "code": "NOT_FOUND",
                    "message": "Каталог не найден или не является директорией",
                    "details": {"path": str(target)},
                },
            },
            status=drf_status.HTTP_400_BAD_REQUEST,
        )

    # создаем ScanJob
    with transaction.atomic():
        job = ScanJob.objects.create(
            status=ScanJob.Status.PENDING,
            progress=0.0,
            message="Инициализация сканирования...",
        )

    # запускаем фоновый поток
    t = threading.Thread(
        target=_scan_job_worker, args=(job.id, str(target)), daemon=True
    )
    t.start()

    return Response(
        {"success": True, "data": ScanJobSerializer(job).data},
        status=drf_status.HTTP_200_OK,
    )


@api_view(["GET"])
def get_scan_job(request, job_id):
    job = ScanJob.objects.filter(id=job_id).first()
    if not job:
        return Response(
            {"success": False, "error": "Job not found"},
            status=drf_status.HTTP_404_NOT_FOUND,
        )
    return Response({"success": True, "data": ScanJobSerializer(job).data})


@api_view(["GET"])
def list_scan_jobs(request):
    qs = ScanJob.objects.all()[:50]
    return Response({"success": True, "data": ScanJobSerializer(qs, many=True).data})