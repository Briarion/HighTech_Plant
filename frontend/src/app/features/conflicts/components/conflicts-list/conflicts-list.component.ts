import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ApiService,
  ApiResponse,
  Downtime as ApiDowntime,
  PlanTask as ApiPlanTask,
} from '../../../../core/services/api.service';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Status = 'new' | 'acknowledged' | 'resolved';
type ConflictType = 'overlap' | 'resource' | 'timing';

// Как бек возвращает конфликты (см. ApiService.getConflicts())
interface ApiConflict {
  id: string | number;
  level?: string;               // 'low'|'medium'|'high'|'critical' или кастом
  code?: string;
  text?: string;
  plan_task: ApiPlanTask;
  downtime: ApiDowntime;
  overlap_start?: string;       // DD-MM-YYYY (если есть)
  overlap_end?: string;         // DD-MM-YYYY (если есть)
  priority_status?: string;     // например, 'утверждено'
  created_at: string;           // ISO
  resolved_at?: string | null;
  status?: Status;              // опционально
}

// Удобный формат для UI (id -> string, чтобы поддержать UUID)
export interface UIConflict {
  id: string;
  status: Status;               // клиентское состояние (можно хранить в API позднее)
  severity: Severity;
  type: ConflictType;
  description: string;
  created_at: string;
  resolved_at?: string;

  // Сводные данные
  overlap_days: number;         // пересечение в днях (включительно)
  overlap_range: { start: string; end: string };

  // Простой
  downtime: {
    id: number;
    kind: string;
    status?: string | null;
    source?: string | null;
    line_name: string;
    start_dt: string;           // DD-MM-YYYY
    end_dt: string;             // DD-MM-YYYY
    partial_date_start?: boolean | null;
    partial_date_end?: boolean | null;
  };

  // Плановая задача
  task: {
    id: number;
    title: string;
    product_name: string;
    product_code: string;
    line_name: string;
    start_dt: string;           // DD-MM-YYYY
    end_dt: string;             // DD-MM-YYYY
  };
}

@Component({
  selector: 'app-conflicts-list',
  standalone: false,
  templateUrl: './conflicts-list.component.html',
  styleUrls: ['./conflicts-list.component.scss']
})
export class ConflictsListComponent implements OnInit {
  conflicts: UIConflict[] = [];
  filteredConflicts: UIConflict[] = [];
  loading = false;
  error = '';

  // фильтры
  selectedSeverity: 'all' | Severity = 'all';
  selectedStatus: 'all' | Status = 'all';
  selectedType: 'all' | ConflictType = 'all';

  Math = Math;

  constructor(
    private router: Router,
    private api: ApiService,
  ) {}

  ngOnInit(): void {
    this.loadConflicts();
  }

  loadConflicts(): void {
    this.loading = true;
    this.error = '';

    this.api.getConflicts().subscribe((res: ApiResponse<ApiConflict[]>) => {
      this.loading = false;

      if (!res?.success) {
        this.error = (res as any)?.error?.message || 'Не удалось загрузить конфликты';
        this.conflicts = [];
        this.filteredConflicts = [];
        return;
      }

      const list = (res.data || []).map(c => this.toUI(c));
      // сортировка по критичности и дате создания
      this.conflicts = list.sort((a, b) =>
        this.severityWeight(b.severity) - this.severityWeight(a.severity)
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      this.applyFilters();
    }, err => {
      this.loading = false;
      this.error = err?.error?.error?.message || err?.error?.message || err?.message || 'Не удалось загрузить конфликты';
    });
  }

  // ---------- Маппинг API -> UI ----------
  private toUI(c: ApiConflict): UIConflict {
    const d = c.downtime;
    const t = c.plan_task;

    const downtimeLine: any = (d as any)?.line ?? null;
    const taskLine: any = (t as any)?.line ?? (t as any)?.production_line ?? null;

    const line_name = downtimeLine?.name ?? `Линия ${downtimeLine?.id ?? '—'}`;
    const task_line_name = taskLine?.name ?? `Линия ${taskLine?.id ?? '—'}`;

    const overlapStart = c.overlap_start ?? this.maxDate(d?.start_dt, t?.start_dt);
    const overlapEnd   = c.overlap_end   ?? this.minDate(d?.end_dt, t?.end_dt);
    const overlap_days = this.overlapDaysInclusive(overlapStart, overlapEnd);

    const severity: Severity = this.pickSeverity(c.level, overlap_days, d?.status);
    const type: ConflictType = 'overlap';
    const status: Status = (c as any).status ?? 'new';

    const description = c.text
      ?? `Пересечение простоя (${d?.kind || 'простой'}) и задачи «${t?.title || t?.product?.name || 'производство'}»`;

    return {
      id: this.asId(c.id),
      status,
      severity,
      type,
      description,
      created_at: c.created_at,
      resolved_at: (c as any)?.resolved_at || undefined,

      overlap_days,
      overlap_range: { start: overlapStart, end: overlapEnd },

      downtime: {
        id: Number(d?.id ?? 0),
        kind: d?.kind || 'Простой',
        status: d?.status ?? null,
        source: (d as any)?.source ?? null,
        line_name,
        start_dt: d?.start_dt || '—',
        end_dt: d?.end_dt || '—',
        partial_date_start: (d as any)?.partial_date_start ?? null,
        partial_date_end: (d as any)?.partial_date_end ?? null,
      },

      task: {
        id: Number(t?.id ?? 0),
        title: t?.title || (t?.product ? `Производство: ${t.product.name}` : 'Задача плана'),
        product_name: t?.product?.name || '—',
        product_code: t?.product?.code || '—',
        line_name: task_line_name,
        start_dt: t?.start_dt || '—',
        end_dt: t?.end_dt || '—',
      },
    };
  }

  private asId(v: string | number | undefined | null): string {
    if (v === undefined || v === null) return '';
    return String(v).trim();
  }

  private pickSeverity(level?: string, overlap_days?: number, downtimeStatus?: string | null): Severity {
    // 1) если API дал уровень — используем его
    const l = (level || '').toLowerCase();
    if (['critical', 'high', 'medium', 'low'].includes(l)) return l as Severity;

    // 2) иначе оценим по длительности пересечения и статусу простоя
    const days = overlap_days ?? 0;
    const s = (downtimeStatus || '').toLowerCase();
    const priorityBoost = (s === 'утверждено' || s === 'выполнено') ? 1 : 0;

    // примитивная шкала
    const raw = days >= 5 ? 3 : days >= 3 ? 2 : days >= 1 ? 1 : 0;
    const val = Math.min(raw + priorityBoost, 3);
    return ['low', 'medium', 'high', 'critical'][val] as Severity;
  }

  // ---------- Фильтры ----------
  onFilterChange(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredConflicts = this.conflicts.filter(c => {
      const severityMatch = this.selectedSeverity === 'all' || c.severity === this.selectedSeverity;
      const statusMatch = this.selectedStatus === 'all' || c.status === this.selectedStatus;
      const typeMatch = this.selectedType === 'all' || c.type === this.selectedType;
      return severityMatch && statusMatch && typeMatch;
    });
  }

  // ---------- Навигация / действия ----------
  onConflictClick(conflict: UIConflict): void {
    const id = (conflict?.id || '').trim();
    if (!id) {
      this.error = 'Некорректный ID конфликта';
      return;
    }
    this.router.navigate(['/conflicts', encodeURIComponent(id)]);
  }

  onRefresh(): void {
    this.loadConflicts();
  }

  acknowledgeConflict(conflict: UIConflict, event: Event): void {
    event.stopPropagation();
    conflict.status = 'acknowledged';
    this.applyFilters();
    // TODO: POST /conflicts/:id/acknowledge
  }

  resolveConflict(conflict: UIConflict, event: Event): void {
    event.stopPropagation();
    conflict.status = 'resolved';
    conflict.resolved_at = new Date().toISOString();
    this.applyFilters();
    // TODO: POST /conflicts/:id/resolve
  }

  // ---------- Экспорт ----------
  onExportCsv(): void {
    const rows = [
      ['id','severity','status','type','overlap_days','downtime_kind','downtime_status','downtime_line','downtime_start','downtime_end','task_title','task_product','task_line','task_start','task_end','created_at','resolved_at'],
      ...this.filteredConflicts.map(c => [
        c.id, c.severity, c.status, c.type, c.overlap_days,
        c.downtime.kind, c.downtime.status ?? '', c.downtime.line_name, c.downtime.start_dt, c.downtime.end_dt,
        c.task.title, `${c.task.product_name} (${c.task.product_code})`, c.task.line_name, c.task.start_dt, c.task.end_dt,
        this.formatDateTime(c.created_at), c.resolved_at ? this.formatDateTime(c.resolved_at) : ''
      ])
    ];
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    this.download(url, `conflicts_${new Date().toISOString().slice(0,10)}.csv`);
  }

  onExportJson(): void {
    const blob = new Blob([JSON.stringify(this.filteredConflicts, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    this.download(url, `conflicts_${new Date().toISOString().slice(0,10)}.json`);
  }

  private download(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Вспомогательные ----------
  getSeverityIcon(severity: Severity): string {
    switch (severity) {
      case 'critical': return 'alert-triangle';
      case 'high': return 'alert';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'info';
    }
  }

  getStatusIcon(status: Status): string {
    switch (status) {
      case 'resolved': return 'check';
      case 'acknowledged': return 'eye';
      case 'new': return 'alert';
      default: return 'info';
    }
  }

  getTypeLabel(type: ConflictType): string {
    switch (type) {
      case 'overlap': return 'Пересечение';
      case 'resource': return 'Ресурсы';
      case 'timing': return 'Время';
      default: return 'Другое';
    }
  }

  getSeverityLabel(severity: Severity): string {
    switch (severity) {
      case 'critical': return 'Критичная';
      case 'high': return 'Высокая';
      case 'medium': return 'Средняя';
      case 'low': return 'Низкая';
      default: return 'Неопределённая';
    }
  }

  getStatusLabel(status: Status): string {
    switch (status) {
      case 'resolved': return 'Разрешён';
      case 'acknowledged': return 'Принят';
      case 'new': return 'Новый';
      default: return 'Неизвестно';
    }
  }

  formatDate(dateStr: string, partial = false): string {
    const d = this.parseDDMMYYYY(dateStr);
    const base = d ? d.toLocaleDateString('ru-RU') : dateStr;
    return partial ? `~${base}` : base;
  }

  formatDateTime(dateStr: string): string {
    // позволяет и DD-MM-YYYY, и ISO
    const d = this.parseDDMMYYYY(dateStr);
    if (d) return d.toLocaleDateString('ru-RU');
    const iso = new Date(dateStr);
    return isNaN(iso.getTime()) ? dateStr : iso.toLocaleString('ru-RU');
  }

  // пересечение (в днях, включительно) между двумя интервалами DD-MM-YYYY
  getOverlapDaysForDisplay(c: UIConflict): number {
    return this.overlapDaysInclusive(c.overlap_range.start, c.overlap_range.end);
    // NB: сейчас это уже precalc, но пусть будет
  }

  private parseDDMMYYYY(x?: string): Date | null {
    if (!x) return null;
    const parts = x.split('-');
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map(Number);
    if (!dd || !mm || !yyyy) return null;
    return new Date(Date.UTC(yyyy, mm - 1, dd));
  }

  private minDate(a?: string, b?: string): string {
    const da = this.parseDDMMYYYY(a || '');
    const db = this.parseDDMMYYYY(b || '');
    if (da && db) return (da <= db ? a! : b!);
    return a || b || '—';
  }

  private maxDate(a?: string, b?: string): string {
    const da = this.parseDDMMYYYY(a || '');
    const db = this.parseDDMMYYYY(b || '');
    if (da && db) return (da >= db ? a! : b!);
    return a || b || '—';
  }

  private daysDiffInclusive(a: string, b: string): number {
    const da = this.parseDDMMYYYY(a);
    const db = this.parseDDMMYYYY(b);
    if (!da || !db) return 0;
    return Math.floor((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  private overlapDaysInclusive(aStart?: string, aEnd?: string): number {
    if (!aStart || !aEnd) return 0;
    const days = this.daysDiffInclusive(aStart, aEnd);
    return Math.max(0, days);
  }

  private severityWeight(s: Severity): number {
    return ({ low: 0, medium: 1, high: 2, critical: 3 } as Record<Severity, number>)[s];
  }
}
