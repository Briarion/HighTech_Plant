"""
Сервисы для обработки документов (Excel, DOCX)
"""
import hashlib
import logging
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from docx import Document
from django.core.files.uploadedfile import UploadedFile
from django.conf import settings

from apps.core.exceptions import FileProcessingError, ValidationError
from apps.notifications.models import FileDigest
from apps.production.models import ProductionLine, Product, PlanTask

logger = logging.getLogger(__name__)


@dataclass
class ProcessingResult:
    """Результат обработки документа"""
    success: bool
    file_path: str
    file_hash: str
    items_created: int
    processing_time_ms: int
    errors: List[str]
    warnings: List[str]
    metadata: Dict[str, Any]


class ExcelProcessorService:
    """Сервис для обработки Excel файлов с планами производства"""
    
    def __init__(self):
        self.max_file_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
        self.supported_extensions = ['.xlsx', '.xls']
    
    async def process_plan_file(self, uploaded_file: UploadedFile) -> ProcessingResult:
        """Обработка Excel файла с планом производства"""
        
        start_time = datetime.now()
        errors = []
        warnings = []
        items_created = 0
        
        try:
            logger.info(f"Processing Excel plan file: {uploaded_file.name}")
            
            # Валидация файла
            self._validate_file(uploaded_file)
            
            # Вычисление хеша файла
            file_hash = self._calculate_file_hash(uploaded_file)
            
            # Проверка дубликатов
            if await self._is_duplicate_file(file_hash):
                logger.info(f"Duplicate file detected: {uploaded_file.name}")
                return ProcessingResult(
                    success=True,
                    file_path=uploaded_file.name,
                    file_hash=file_hash,
                    items_created=0,
                    processing_time_ms=0,
                    errors=[],
                    warnings=["Файл уже был обработан ранее"],
                    metadata={'duplicate': True}
                )
            
            # Чтение Excel файла
            try:
                df = pd.read_excel(
                    uploaded_file,
                    engine='openpyxl' if uploaded_file.name.endswith('.xlsx') else 'xlrd'
                )
            except Exception as e:
                raise FileProcessingError(f"Не удалось прочитать Excel файл: {e}")
            
            # Обработка данных
            tasks_created, tasks_updated, date_warnings = await self._process_plan_data(df, uploaded_file.name)
            items_created = tasks_created + tasks_updated
            warnings.extend(date_warnings)
            
            # Создание уведомлений о коррекции дат
            await self._create_date_coercion_notifications(date_warnings, uploaded_file.name)
            
            # Сохранение информации о файле
            await self._save_file_digest(
                uploaded_file.name, file_hash, 'excel',
                {
                    'tasks_created': tasks_created,
                    'tasks_updated': tasks_updated,
                    'warnings_count': len(warnings)
                }
            )
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            logger.info(f"Excel processing completed: {tasks_created} created, {tasks_updated} updated in {processing_time}ms")
            
            return ProcessingResult(
                success=True,
                file_path=uploaded_file.name,
                file_hash=file_hash,
                items_created=items_created,
                processing_time_ms=processing_time,
                errors=errors,
                warnings=warnings,
                metadata={
                    'tasks_created': tasks_created,
                    'tasks_updated': tasks_updated
                }
            )
            
        except Exception as e:
            logger.error(f"Excel processing failed for {uploaded_file.name}: {e}", exc_info=True)
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return ProcessingResult(
                success=False,
                file_path=uploaded_file.name,
                file_hash="",
                items_created=0,
                processing_time_ms=processing_time,
                errors=[str(e)],
                warnings=warnings,
                metadata={}
            )
    
    def _validate_file(self, uploaded_file: UploadedFile):
        """Валидация загруженного файла"""
        
        # Проверка расширения
        file_ext = Path(uploaded_file.name).suffix.lower()
        if file_ext not in self.supported_extensions:
            raise ValidationError(
                f"Неподдерживаемый формат файла: {file_ext}. "
                f"Поддерживаются: {', '.join(self.supported_extensions)}"
            )
        
        # Проверка размера
        if uploaded_file.size > self.max_file_size:
            size_mb = uploaded_file.size / 1024 / 1024
            max_mb = self.max_file_size / 1024 / 1024
            raise ValidationError(
                f"Размер файла ({size_mb:.1f} МБ) превышает максимально допустимый ({max_mb} МБ)"
            )
    
    def _calculate_file_hash(self, uploaded_file: UploadedFile) -> str:
        """Вычисление SHA256 хеша файла"""
        hasher = hashlib.sha256()
        
        # Читаем файл порциями для больших файлов
        uploaded_file.seek(0)
        for chunk in iter(lambda: uploaded_file.read(4096), b""):
            hasher.update(chunk)
        uploaded_file.seek(0)  # Возвращаем указатель в начало
        
        return hasher.hexdigest()
    
    async def _is_duplicate_file(self, file_hash: str) -> bool:
        """Проверка, не обрабатывался ли файл ранее"""
        return await FileDigest.objects.filter(sha256=file_hash).aexists()
    
    async def _process_plan_data(self, df: pd.DataFrame, filename: str) -> Tuple[int, int, List[str]]:
        """Обработка данных плана производства: сбор -> коррекция -> запись"""
        tasks_created = 0
        tasks_updated = 0
        all_warnings: List[str] = []

        column_mapping = self._map_columns(df.columns.tolist())
        if not all(key in column_mapping for key in ['task', 'product', 'start', 'end']):
            expected_headers = ['Произ. Задание', 'Продукт', 'Начало выполнения', 'Завершение выполнения']
            raise FileProcessingError(
                f"Не найдены обязательные колонки. Ожидаемые заголовки: {expected_headers}. "
                f"Найденные колонки: {list(df.columns)}"
            )

        # Одна линия по умолчанию (как и было)
        line, _ = await ProductionLine.objects.aget_or_create(
            name="Линия_66",
            defaults={
                'description': 'Основная производственная линия',
                'is_active': True
            }
        )

        # 1) Сбор задач без записи в БД
        collected: List[Dict[str, Any]] = []
        for index, row in df.iterrows():
            try:
                task_data = self._extract_task_from_row(row, column_mapping, index)
                if not task_data:
                    continue
                collected.append({
                    **task_data,
                    'row_index': index  # на случай одинаковых стартов — стабильная сортировка
                })
                all_warnings.extend(task_data.get('warnings', []))
            except Exception as e:
                logger.warning(f"Failed to process row {index}: {e}")
                continue

        if not collected:
            return 0, 0, all_warnings

        # 2) Сортировка по дате старта (а затем по исходному порядку на случай None/равенств)
        collected.sort(key=lambda x: (x['start_date'], x['row_index']))

        # 3) Коррекция наложений: если старт совпадает с окончанием предыдущей, сдвигаем на +1 день
        #    Дополнительно: если обнаружим реальное перекрытие (старт < конец предыдущей), тоже сдвинем.
        prev_end: Optional[date] = None
        for i, t in enumerate(collected):
            sd: date = t['start_date']
            ed: date = t['end_date']

            # Если даты перепутаны, уже было выровнено в _extract_task_from_row, но проверим
            if sd > ed:
                sd, ed = ed, sd
                t['start_date'], t['end_date'] = sd, ed

            if prev_end is not None:
                # Ровно по требованию: если старт == предыдущему окончанию -> старт = prev_end + 1
                if sd == prev_end:
                    new_sd = prev_end + timedelta(days=1)
                    msg = (f"Старт задачи '{t['title']}' сдвинут с {sd.strftime('%d.%m.%Y')} "
                        f"на {new_sd.strftime('%d.%m.%Y')} из-за совпадения с окончанием предыдущей задачи.")
                    t.setdefault('warnings', []).append(msg)
                    all_warnings.append(msg)
                    sd = new_sd
                    # если после сдвига старт ушёл за конец — подтянем конец (минимум 1 день длительности)
                    if ed < sd:
                        ed = sd

                # Безопасность от реального наложения: старт раньше конца предыдущей
                elif sd < prev_end:
                    new_sd = prev_end + timedelta(days=1)
                    msg = (f"Старт задачи '{t['title']}' сдвинут с {sd.strftime('%d.%m.%Y')} "
                        f"на {new_sd.strftime('%d.%m.%Y')} для устранения перекрытия с предыдущей задачей.")
                    t.setdefault('warnings', []).append(msg)
                    all_warnings.append(msg)
                    sd = new_sd
                    if ed < sd:
                        ed = sd

            # сохранить откорректированные даты обратно
            t['start_date'], t['end_date'] = sd, ed
            prev_end = ed if (prev_end is None or ed > prev_end) else prev_end

        # 4) Запись в БД
        for t in collected:
            product, _ = await Product.objects.aget_or_create(
                name=t['product_name'],
                defaults={'description': f'Создан автоматически из файла {filename}'}
            )

            task, created = await PlanTask.objects.aupdate_or_create(
                production_line=line,
                product=product,
                title=t['title'],
                defaults={
                    'start_dt': t['start_date'],
                    'end_dt': t['end_date'],
                    'source': 'excel'
                }
            )
            if created:
                tasks_created += 1
                logger.debug(f"Created task: {task.title} ({task.start_dt} - {task.end_dt})")
            else:
                tasks_updated += 1
                logger.debug(f"Updated task: {task.title} ({task.start_dt} - {task.end_dt})")

        return tasks_created, tasks_updated, all_warnings
    
    def _map_columns(self, columns: List[str]) -> Dict[str, str]:
        """Сопоставление колонок с ожидаемыми названиями (точные русские заголовки)"""
        
        column_mapping = {}
        
        # Точные заголовки из требований
        expected_headers = {
            'Произ. Задание': 'task',
            'Продукт': 'product', 
            'Начало выполнения': 'start',
            'Завершение выполнения': 'end'
        }
        
        # Сначала ищем точные совпадения
        for col in columns:
            col_cleaned = col.strip()
            if col_cleaned in expected_headers:
                column_mapping[expected_headers[col_cleaned]] = col_cleaned
        
        # Если не все колонки найдены, пробуем частичные совпадения
        if len(column_mapping) < 4:
            columns_lower = [col.lower().strip() for col in columns]
            
            # Произ. Задание
            if 'task' not in column_mapping:
                task_variants = ['произ', 'задание', 'производственная', 'задача']
                for variant in task_variants:
                    for i, col in enumerate(columns_lower):
                        if variant in col:
                            column_mapping['task'] = columns[i].strip()
                            break
                    if 'task' in column_mapping:
                        break
            
            # Продукт
            if 'product' not in column_mapping:
                product_variants = ['продукт', 'изделие', 'товар']
                for variant in product_variants:
                    for i, col in enumerate(columns_lower):
                        if variant in col:
                            column_mapping['product'] = columns[i].strip()
                            break
                    if 'product' in column_mapping:
                        break
            
            # Начало выполнения
            if 'start' not in column_mapping:
                start_variants = ['начало', 'выполнения', 'старт', 'дата начала']
                for variant in start_variants:
                    for i, col in enumerate(columns_lower):
                        if variant in col and ('начало' in col or 'старт' in col):
                            column_mapping['start'] = columns[i].strip()
                            break
                    if 'start' in column_mapping:
                        break
            
            # Завершение выполнения
            if 'end' not in column_mapping:
                end_variants = ['завершение', 'окончание', 'конец', 'дата окончания']
                for variant in end_variants:
                    for i, col in enumerate(columns_lower):
                        if variant in col and ('завершение' in col or 'окончание' in col):
                            column_mapping['end'] = columns[i].strip()
                            break
                    if 'end' in column_mapping:
                        break
        
        logger.debug(f"Column mapping: {column_mapping}")
        logger.debug(f"Available columns: {columns}")
        return column_mapping
    
    def _extract_task_from_row(self, row: pd.Series, column_mapping: Dict[str, str], row_index: int) -> Optional[Dict[str, Any]]:
        """Извлечение данных задачи из строки Excel"""
        
        try:
            # Извлекаем значения
            task_title = str(row[column_mapping['task']]).strip()
            product_name = str(row[column_mapping['product']]).strip()
            start_date_val = row[column_mapping['start']]
            end_date_val = row[column_mapping['end']]
            
            # Пропускаем пустые строки
            if pd.isna(task_title) or task_title.lower() in ['nan', '', 'none']:
                return None
            
            # Парсинг дат с получением предупреждений
            start_date, start_warnings = self._parse_date(start_date_val, f"строка {row_index + 2}, столбец 'Начало выполнения'")
            end_date, end_warnings = self._parse_date(end_date_val, f"строка {row_index + 2}, столбец 'Завершение выполнения'")
            
            all_warnings = start_warnings + end_warnings
            
            if not start_date or not end_date:
                logger.warning(f"Invalid dates in row {row_index}: start={start_date_val}, end={end_date_val}")
                return None
            
            # Коррекция дат если необходимо
            if start_date > end_date:
                logger.warning(f"Start date after end date in row {row_index}, swapping")
                start_date, end_date = end_date, start_date
            
            return {
                'title': task_title,
                'product_name': product_name,
                'start_date': start_date,
                'end_date': end_date,
                'warnings': all_warnings
            }
            
        except Exception as e:
            logger.error(f"Error extracting data from row {row_index}: {e}")
            return None
    
    def _parse_date(self, date_val: Any, context: str) -> Tuple[Optional[date], List[str]]:
        """Парсинг даты из формата DD.MM.YYYY с коррекцией невозможных дат"""
        
        warnings = []
        
        if pd.isna(date_val):
            return None, warnings
        
        try:
            # Если уже datetime
            if isinstance(date_val, (datetime, pd.Timestamp)):
                return date_val.date(), warnings
            
            # Если строка в формате DD.MM.YYYY
            if isinstance(date_val, str):
                date_str = date_val.strip()
                
                # Основной формат DD.MM.YYYY
                try:
                    return datetime.strptime(date_str, '%d.%m.%Y').date(), warnings
                except ValueError:
                    # Попробуем скорректировать невозможную дату
                    corrected_date, correction_warning = self._coerce_invalid_date(date_str, context)
                    if corrected_date:
                        warnings.append(correction_warning)
                        return corrected_date, warnings
                    
                    # Пробуем другие форматы как fallback
                    fallback_formats = ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d']
                    for fmt in fallback_formats:
                        try:
                            return datetime.strptime(date_str, fmt).date(), warnings
                        except ValueError as e:
                            logger.error(f"Failed to parse date '{date_str}' with format '{fmt}': {e}")
                            continue
                
                logger.warning(f"Could not parse date '{date_val}' in {context}")
                return None, warnings
            
            # Если число (Excel timestamp)
            if isinstance(date_val, (int, float)):
                try:
                    # Excel дата как число дней от 1900-01-01
                    excel_epoch = datetime(1900, 1, 1)
                    delta_days = int(date_val) - 2  # Коррекция для Excel
                    return (excel_epoch + pd.Timedelta(days=delta_days)).date(), warnings
                except:  # noqa: E722
                    return None, warnings
            
            return None, warnings
            
        except Exception as e:
            logger.warning(f"Date parsing error for '{date_val}' in {context}: {e}")
            return None, warnings
    
    def _coerce_invalid_date(self, date_str: str, context: str) -> Tuple[Optional[date], Optional[str]]:
        """Коррекция невозможных дат (например, 31.04.2026 -> 30.04.2026)"""
        
        try:
            # Парсим компоненты даты
            parts = date_str.split('.')
            if len(parts) != 3:
                return None, None
            
            day, month, year = map(int, parts)
            
            # Проверяем корректность месяца
            if not (1 <= month <= 12):
                return None, None
            
            # Проверяем корректность дня для данного месяца
            import calendar
            max_day = calendar.monthrange(year, month)[1]
            
            if day > max_day:
                # Корректируем день до последнего дня месяца
                corrected_date = date(year, month, max_day)
                
                # Создаем предупреждение на русском языке
                original_date_str = f"{day:02d}.{month:02d}.{year}"
                corrected_date_str = corrected_date.strftime('%d.%m.%Y')
                
                warning_msg = (
                    f"Дата '{original_date_str}' в {context} скорректирована на "
                    f"'{corrected_date_str}' (последний день месяца)"
                )
                
                logger.info(f"Date coerced: {original_date_str} -> {corrected_date_str} in {context}")
                
                return corrected_date, warning_msg
            
            return None, None
            
        except (ValueError, IndexError) as e:
            logger.debug(f"Could not coerce invalid date '{date_str}': {e}")
            return None, None
    
    async def _create_date_coercion_notifications(self, date_warnings: List[str], filename: str):
        """Создание уведомлений о коррекции дат"""
        
        if not date_warnings:
            return
            
        from apps.notifications.models import Notification
        
        try:
            for warning in date_warnings:
                # Создаем уведомление о коррекции даты
                await Notification.objects.acreate(
                    level='warning',
                    code='PLAN_DATE_COERCED',
                    text=f"Коррекция даты в файле '{filename}': {warning}",
                    payload_json={
                        'filename': filename,
                        'warning_text': warning,
                        'source': 'excel_upload'
                    }
                )
                
        except Exception as e:
            logger.error(f"Failed to create date coercion notifications: {e}")
    
    async def _save_file_digest(self, filename: str, file_hash: str, kind: str, processing_result: Dict[str, Any]):
        """Сохранение информации об обработанном файле"""
        
        try:
            await FileDigest.objects.acreate(
                path=filename,
                sha256=file_hash,
                kind=kind,
                file_size=0,  # Размер файла не сохраняем для uploaded files
                processing_result=processing_result
            )
        except Exception as e:
            logger.error(f"Failed to save file digest for {filename}: {e}")


class DocumentProcessorService:
    """Сервис для обработки DOCX документов"""
    
    def __init__(self):
        self.max_file_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
        self.supported_extensions = ['.docx']
    
    async def process_docx_file(self, uploaded_file: UploadedFile) -> ProcessingResult:
        """Обработка DOCX файла с протоколом"""
        
        start_time = datetime.now()
        
        try:
            logger.info(f"Processing DOCX file: {uploaded_file.name}")
            
            # Валидация файла
            self._validate_file(uploaded_file)
            
            # Вычисление хеша
            file_hash = self._calculate_file_hash(uploaded_file)
            
            # Извлечение текста из DOCX
            text_content = self._extract_text_from_docx(uploaded_file)
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return ProcessingResult(
                success=True,
                file_path=uploaded_file.name,
                file_hash=file_hash,
                items_created=0,
                processing_time_ms=processing_time,
                errors=[],
                warnings=[],
                metadata={
                    'text_length': len(text_content),
                    'paragraph_count': len(text_content.split('\n'))
                }
            )
            
        except Exception as e:
            logger.error(f"DOCX processing failed for {uploaded_file.name}: {e}", exc_info=True)
            
            processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return ProcessingResult(
                success=False,
                file_path=uploaded_file.name,
                file_hash="",
                items_created=0,
                processing_time_ms=processing_time,
                errors=[str(e)],
                warnings=[],
                metadata={}
            )
    
    def _validate_file(self, uploaded_file: UploadedFile):
        """Валидация DOCX файла"""
        
        file_ext = Path(uploaded_file.name).suffix.lower()
        if file_ext not in self.supported_extensions:
            raise ValidationError(f"Неподдерживаемый формат файла: {file_ext}")
        
        if uploaded_file.size > self.max_file_size:
            raise ValidationError(f"Размер файла превышает {self.max_file_size / 1024 / 1024} МБ")
    
    def _calculate_file_hash(self, uploaded_file: UploadedFile) -> str:
        """Вычисление хеша файла"""
        hasher = hashlib.sha256()
        uploaded_file.seek(0)
        
        for chunk in iter(lambda: uploaded_file.read(4096), b""):
            hasher.update(chunk)
        
        uploaded_file.seek(0)
        return hasher.hexdigest()
    
    def _extract_text_from_docx(self, uploaded_file: UploadedFile) -> str:
        """Извлечение текста из DOCX файла"""
        
        try:
            doc = Document(uploaded_file)
            
            paragraphs = []
            for paragraph in doc.paragraphs:
                text = paragraph.text.strip()
                if text:  # Пропускаем пустые параграфы
                    paragraphs.append(text)
            
            return '\n'.join(paragraphs)
            
        except Exception as e:
            raise FileProcessingError(f"Не удалось извлечь текст из DOCX: {e}")


class FileProcessingManager:
    """Менеджер для обработки различных типов файлов"""
    
    def __init__(self):
        self.excel_processor = ExcelProcessorService()
        self.docx_processor = DocumentProcessorService()
    
    async def process_file(self, uploaded_file: UploadedFile) -> ProcessingResult:
        """Обработка файла в зависимости от типа"""
        
        file_ext = Path(uploaded_file.name).suffix.lower()
        
        if file_ext in ['.xlsx', '.xls']:
            return await self.excel_processor.process_plan_file(uploaded_file)
        elif file_ext == '.docx':
            return await self.docx_processor.process_docx_file(uploaded_file)
        else:
            raise ValidationError(f"Неподдерживаемый тип файла: {file_ext}")
    
    def get_supported_extensions(self) -> List[str]:
        """Получение списка поддерживаемых расширений"""
        return ['.xlsx', '.xls', '.docx']