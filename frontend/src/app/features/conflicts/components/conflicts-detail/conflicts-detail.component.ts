import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ApiService,
  ApiResponse,
  Downtime as ApiDowntime,
  PlanTask as ApiPlanTask
} from '../../../../core/services/api.service';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'new' | 'acknowledged' | 'resolved';
type ConflictType = 'overlap' | 'resource' | 'timing';

interface ConflictDetail {
  id: string;                   // ← строка (поддержка UUID и чисел)
  downtime_id: number;
  task_id: number;
  severity: Severity;
  status: Status;
  type: ConflictType;
  description: string;
  created_at: string;       // ISO
  resolved_at?: string;
  resolution_notes?: string;

  downtime_info: {
    kind?: string;
    start_dt: string;       // DD-MM-YYYY или ISO
    end_dt: string;         // DD-MM-YYYY или ISO
    line_id: number;
    line_name?: string;
    confidence?: number;
  };

  task_info: {
    product_name?: string;
    start_dt: string;       // DD-MM-YYYY или ISO
    end_dt: string;         // DD-MM-YYYY или ISO
    line_id: number;
    line_name?: string;
  };

  analysis?: {
    overlap_duration_hours: number;
    impact_level: 'low' | 'medium' | 'high';
    recommended_actions: string[];
    financial_impact?: number;
  };
}

// Вариант конфликта из API (как в списке)
interface ApiConflictRaw {
  id: number | string;
  level?: string;
  status?: Status;
  type?: ConflictType;
  text?: string;
  code?: string;
  created_at: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  overlap_start?: string;   // DD-MM-YYYY
  overlap_end?: string;     // DD-MM-YYYY
  priority_status?: string;
  downtime: ApiDowntime;
  plan_task: ApiPlanTask;   // может быть .line или .production_line
}

// Уже свернутый вариант из API (деталь)
interface ApiConflictFolded {
  id: number | string;
  severity: Severity;
  status: Status;
  type: ConflictType;
  description: string;
  created_at: string;
  resolved_at?: string;
  resolution_notes?: string;
  downtime_id: number;
  task_id: number;
  downtime_info: ConflictDetail['downtime_info'];
  task_info: ConflictDetail['task_info'];
  analysis?: ConflictDetail['analysis'];
}

@Component({
  selector: 'app-conflicts-detail',
  standalone: false,
  templateUrl: './conflicts-detail.component.html',
  styleUrls: ['./conflicts-detail.component.scss']
})
export class ConflictsDetailComponent implements OnInit {
  conflict: ConflictDetail | null = null;
  loading = false;
  error = '';
  resolutionNotes = '';
  showResolutionForm = false;

  Math = Math;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    // поддержим прямые ссылки с UUID/числом
    const raw = this.route.snapshot.paramMap.get('id');
    const idParam = raw ? decodeURIComponent(raw) : '';
    if (idParam) {
      this.loadConflict(idParam);
    } else {
      this.error = 'ID не указан';
    }
  }

  // --------------------- load & map ---------------------
  loadConflict(id: string): void {
    this.loading = true;
    this.error = '';

    // Если у ApiService есть метод getConflictById — используем его, иначе fallback через getConflicts()
    const apiAny: any = this.api as any;
    if (typeof apiAny.getConflictById === 'function') {
      apiAny.getConflictById(id).subscribe({
        next: (res: ApiResponse<ApiConflictRaw | ApiConflictFolded>) => {
          this.loading = false;
          if (!res?.success || !res.data) {
            this.error = (res as any)?.error?.message || 'Не удалось загрузить конфликт';
            return;
          }
          this.conflict = this.toDetail(res.data);
          this.ensureAnalysis();
        },
        error: (err: any) => {
          this.loading = false;
          this.error = err?.error?.error?.message || err?.error?.message || err?.message || 'Не удалось загрузить конфликт';
        }
      });
      return;
    }

    // Fallback: загрузим все и найдем по id (строкой)
    this.api.getConflicts().subscribe({
      next: (res: ApiResponse<(ApiConflictRaw | ApiConflictFolded)[]>) => {
        this.loading = false;

        if (!res?.success) {
          this.error = (res as any)?.error?.message || 'Не удалось загрузить конфликт';
          return;
        }

        const payload = res.data || [];
        const found = payload.find((c: any) => {
          const cid = String(c?.id ?? '').trim();
          // Совпадение по строке; для совместимости — еще и числовое (если оба числа)
          if (cid === id) return true;
          if (/^\d+$/.test(cid) && /^\d+$/.test(id)) return parseInt(cid, 10) === parseInt(id, 10);
          return false;
        });

        if (!found) {
          this.error = 'Конфликт не найден';
          return;
        }

        this.conflict = this.toDetail(found);
        this.ensureAnalysis();
      },
      error: (err: any) => {
        this.loading = false;
        this.error = err?.error?.error?.message || err?.error?.message || err?.message || 'Не удалось загрузить конфликт';
      }
    });
  }

  private ensureAnalysis(): void {
    if (!this.conflict) return;
    if (!this.conflict.analysis?.overlap_duration_hours) {
      const hours = this.computeOverlapHours(
        this.conflict.downtime_info.start_dt,
        this.conflict.downtime_info.end_dt,
        this.conflict.task_info.start_dt,
        this.conflict.task_info.end_dt
      );
      const impact = this.impactFromHours(hours);
      this.conflict.analysis = this.conflict.analysis || {
        overlap_duration_hours: hours,
        impact_level: impact,
        recommended_actions: []
      };
      this.conflict.analysis.overlap_duration_hours = hours;
      this.conflict.analysis.impact_level = impact;
    }
  }

  private toDetail(c: ApiConflictRaw | ApiConflictFolded): ConflictDetail {
    // Вариант 1: уже свернутый
    if ((c as any).downtime_info && (c as any).task_info) {
      const f = c as ApiConflictFolded;
      return {
        id: String(f.id),
        downtime_id: Number(f.downtime_id),
        task_id: Number(f.task_id),
        severity: f.severity || 'medium',
        status: f.status || 'new',
        type: f.type || 'overlap',
        description: f.description || 'Конфликт планирования',
        created_at: f.created_at,
        resolved_at: f.resolved_at || undefined,
        resolution_notes: f.resolution_notes || undefined,
        downtime_info: { ...f.downtime_info },
        task_info: { ...f.task_info },
        analysis: f.analysis ? { ...f.analysis } : undefined
      };
    }

    // Вариант 2: сырой из списка
    const r = c as ApiConflictRaw;
    const d = r.downtime;
    const t = r.plan_task;

    // line в задаче (учтём оба случая: t.line и t.production_line)
    const taskLine: any = (t as any).line || (t as any).production_line || null;
    const downtimeLine: any = (d as any).line || null;

    const detail: ConflictDetail = {
      id: String(r.id),
      downtime_id: Number(d?.id ?? 0),
      task_id: Number(t?.id ?? 0),
      severity: this.pickSeverity(r.level, d?.status),
      status: r.status || 'new',
      type: r.type || 'overlap',
      description: r.text || `Пересечение простоя (${d?.kind || 'простой'}) и задачи «${t?.title || t?.product?.name || 'производство'}»`,
      created_at: r.created_at,
      resolved_at: r.resolved_at || undefined,
      resolution_notes: r.resolution_notes || undefined,

      downtime_info: {
        kind: d?.kind || 'Простой',
        start_dt: d?.start_dt || '',
        end_dt: d?.end_dt || '',
        line_id: downtimeLine?.id ?? 0,
        line_name: downtimeLine?.name ?? `Линия ${downtimeLine?.id ?? '—'}`,
        confidence: (d as any)?.confidence ?? undefined
      },

      task_info: {
        product_name: t?.product?.name || t?.title || 'Производство',
        start_dt: t?.start_dt || '',
        end_dt: t?.end_dt || '',
        line_id: taskLine?.id ?? 0,
        line_name: taskLine?.name ?? `Линия ${taskLine?.id ?? '—'}`
      },

      analysis: undefined
    };

    return detail;
  }

  private pickSeverity(level?: string, downtimeStatus?: string | null): Severity {
    const l = (level || '').toLowerCase();
    if (['critical','high','medium','low'].includes(l)) return l as Severity;

    // если API не дал — повышаем, если статус простоя высокий
    const s = (downtimeStatus || '').toLowerCase();
    if (s === 'утверждено') return 'high';
    if (s === 'выполнено')  return 'medium';
    return 'medium';
  }

  // --------------------- actions ---------------------
  onBack(): void {
    this.router.navigate(['/conflicts']);
  }

  acknowledgeConflict(): void {
    if (!this.conflict) return;
    this.conflict.status = 'acknowledged';
    // TODO: POST /conflicts/:id/acknowledge
  }

  showResolveForm(): void {
    this.showResolutionForm = true;
  }

  hideResolveForm(): void {
    this.showResolutionForm = false;
    this.resolutionNotes = '';
  }

  resolveConflict(): void {
    if (!this.conflict) return;
    this.conflict.status = 'resolved';
    this.conflict.resolved_at = new Date().toISOString();
    this.conflict.resolution_notes = this.resolutionNotes;
    // TODO: POST /conflicts/:id/resolve { notes }
    this.hideResolveForm();
  }

  // --------------------- formatting ---------------------
  getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return 'alert-triangle';
      case 'high': return 'alert';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'info';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'resolved': return 'check';
      case 'acknowledged': return 'eye';
      case 'new': return 'alert';
      default: return 'info';
    }
  }

  getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'critical': return 'Критичная';
      case 'high': return 'Высокая';
      case 'medium': return 'Средняя';
      case 'low': return 'Низкая';
      default: return 'Неопределённая';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'resolved': return 'Разрешён';
      case 'acknowledged': return 'Принят';
      case 'new': return 'Новый';
      default: return 'Неизвестно';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'overlap': return 'Пересечение времени';
      case 'resource': return 'Конфликт ресурсов';
      case 'timing': return 'Нарушение времени';
      default: return 'Другой тип';
    }
  }

  getImpactLabel(impact: string): string {
    switch (impact) {
      case 'high': return 'Высокое';
      case 'medium': return 'Среднее';
      case 'low': return 'Низкое';
      default: return 'Неопределённое';
    }
  }

  formatDateTime(dateStr: string): string {
    const dd = this.parseDDMMYYYY(dateStr);
    if (dd) return dd.toLocaleString('ru-RU');
    const iso = new Date(dateStr);
    return isNaN(iso.getTime()) ? dateStr : iso.toLocaleString('ru-RU');
  }

  formatDate(dateStr: string): string {
    const dd = this.parseDDMMYYYY(dateStr);
    if (dd) return dd.toLocaleDateString('ru-RU');
    const iso = new Date(dateStr);
    return isNaN(iso.getTime()) ? dateStr : iso.toLocaleDateString('ru-RU');
  }

  formatTime(dateStr: string): string {
    // Покажем время, только если оно есть. Для DD-MM-YYYY вернём "—".
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(amount);
  }

  // --------------------- overlap helpers ---------------------
  private parseDDMMYYYY(x?: string): Date | null {
    if (!x) return null;
    if (!/^\d{2}-\d{2}-\d{4}$/.test(x)) return null;
    const [dd, mm, yyyy] = x.split('-').map(Number);
    return new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  }

  private coerceToDate(x?: string): Date | null {
    if (!x) return null;
    const d1 = this.parseDDMMYYYY(x);
    if (d1) return d1;
    const d2 = new Date(x);
    return isNaN(d2.getTime()) ? null : d2;
  }

  private computeOverlapHours(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
    const A1 = this.coerceToDate(aStart);
    const A2 = this.coerceToDate(aEnd);
    const B1 = this.coerceToDate(bStart);
    const B2 = this.coerceToDate(bEnd);
    if (!A1 || !A2 || !B1 || !B2) return 0;

    // Если пришли только даты (без времени), считаем как полные дни: [00:00, 23:59:59]
    const isDateOnly = (s: string) => /^\d{2}-\d{2}-\d{4}$/.test(s);
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const aStartDt = isDateOnly(aStart) ? new Date(A1.getFullYear(), A1.getMonth(), A1.getDate(), 0, 0, 0, 0) : A1;
    const aEndDt   = isDateOnly(aEnd)   ? endOfDay(A2) : A2;
    const bStartDt = isDateOnly(bStart) ? new Date(B1.getFullYear(), B1.getMonth(), B1.getDate(), 0, 0, 0, 0) : B1;
    const bEndDt   = isDateOnly(bEnd)   ? endOfDay(B2) : B2;

    const start = Math.max(aStartDt.getTime(), bStartDt.getTime());
    const end   = Math.min(aEndDt.getTime(), bEndDt.getTime());

    if (end <= start) return 0;
    return (end - start) / (1000 * 60 * 60);
  }

  private impactFromHours(h: number): 'low' | 'medium' | 'high' {
    if (h >= 6) return 'high';
    if (h >= 2) return 'medium';
    return 'low';
  }
}
