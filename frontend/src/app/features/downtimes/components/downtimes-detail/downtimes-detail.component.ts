import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

interface Downtime {
  id: number;
  line?: { id: number; name: string } | null;
  start_dt: string;                 // DD-MM-YYYY
  end_dt: string;                   // DD-MM-YYYY
  status?: string | null;
  kind?: string | null;
  source_file?: string | null;
  evidence_quote?: string | null;
  evidence_location?: string | null;
  confidence?: number | null;
  partial_date_start?: boolean | null;
  partial_date_end?: boolean | null;
  notes?: string | null;
  source?: string | null;
  created_at: string;               // ISO datetime или строка
  updated_at?: string | null;
  extraction_version?: string | null;
  source_hash?: string | null;
  sources_json?: any[] | null;
}

interface UIDowntime extends Downtime {
  line_name: string;
  duration_days: number;
}

@Component({
  selector: 'app-downtimes-detail',
  standalone: false,
  templateUrl: './downtimes-detail.component.html',
  styleUrls: ['./downtimes-detail.component.scss']
})
export class DowntimesDetailComponent implements OnInit {
  downtime: UIDowntime | null = null;
  loading = false;
  error = '';
  showFullQuote = false;
  showSources = false;

  Math = Math; // для шаблона

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isFinite(id)) this.loadDowntime(id);
    else this.error = 'Некорректный идентификатор простоя';
  }

  private apiUrl(id: number) {
    return `${environment.apiUrl}/downtimes/${id}/`;
  }

  loadDowntime(id: number): void {
    this.loading = true;
    this.error = '';
    this.http.get<any>(this.apiUrl(id)).subscribe({
      next: (res) => {
        // DRF detail обычно отдаёт объект, но на всякий — поддержим {data: {...}}
        const raw: Downtime = Array.isArray(res) ? res[0] : (res?.data ?? res);
        if (!raw) {
          this.error = 'Пустой ответ от сервера';
          this.loading = false;
          return;
        }
        const ui = this.toUI(raw);
        this.downtime = ui;
        this.loading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.error = err?.error?.error?.message || err?.error?.message || err.message || 'Не удалось загрузить простой';
        this.loading = false;
      }
    });
  }

  private toUI(d: Downtime): UIDowntime {
    const line_name = d.line?.name ?? `Линия ${d.line?.id ?? '—'}`;
    const duration_days = this.diffDaysInclusive(d.start_dt, d.end_dt);
    return { ...d, line_name, duration_days };
  }

  // ==== Вспомогательные ====
  onBack(): void {
    this.router.navigate(['/downtimes']);
  }

  copyText(text?: string | null, ev?: MouseEvent): void {
    ev?.stopPropagation();
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  isUrl(path?: string | null): boolean {
    if (!path) return false;
    return /^https?:\/\//i.test(path);
  }

  openSourceFile(path?: string | null, ev?: MouseEvent): void {
    ev?.stopPropagation();
    if (this.isUrl(path)) window.open(path!, '_blank');
  }

  maskHash(hash?: string | null, left = 8, right = 6): string {
    if (!hash || hash.length <= left + right) return hash ?? '—';
    return `${hash.slice(0, left)}…${hash.slice(-right)}`;
  }

  getConfidenceLevel(): 'high' | 'medium' | 'low' | 'unknown' {
    const c = this.downtime?.confidence;
    if (c === null || c === undefined) return 'unknown';
    if (c >= 0.9) return 'high';
    if (c >= 0.7) return 'medium';
    return 'low';
  }

  getStatusClass(status?: string | null): string {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'утверждено':   return 'status-approved';
      case 'выполнено':    return 'status-done';
      case 'план':         return 'status-plan';
      case 'предложение':  return 'status-proposal';
      case 'обсуждение':   return 'status-discuss';
      default:             return 'status-unknown';
    }
  }

  getSourceLabel(source?: string | null): string {
    const s = (source || '').toLowerCase();
    if (s === 'llm') return 'LLM';
    if (s === 'fallback') return 'Парсер';
    if (s === 'manual') return 'Ручной';
    return 'Источник?';
  }

  getSourceClass(source?: string | null): string {
    const s = (source || '').toLowerCase();
    if (s === 'llm') return 'source-llm';
    if (s === 'fallback') return 'source-fallback';
    if (s === 'manual') return 'source-manual';
    return 'source-unknown';
  }

  // ==== Даты ====
  private parseDDMMYYYY(x?: string | null): Date | null {
    if (!x) return null;
    const parts = x.split('-');
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map(Number);
    if (!dd || !mm || !yyyy) return null;
    return new Date(Date.UTC(yyyy, mm - 1, dd));
  }

  private diffDaysInclusive(start: string, end: string): number {
    const s = this.parseDDMMYYYY(start);
    const e = this.parseDDMMYYYY(end);
    if (!s || !e) return 0;
    const days = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    return days + 1;
  }

  formatDate(dateStr?: string | null, partial = false): string {
    const d = this.parseDDMMYYYY(dateStr ?? '');
    const base = d ? d.toLocaleDateString('ru-RU') : (dateStr ?? '—');
    return partial ? `~${base}` : base;
  }

  formatDateTime(dateStr?: string | null): string {
    if (!dateStr) return '—';
    // если пришла DD-MM-YYYY, просто дата
    const dd = this.parseDDMMYYYY(dateStr);
    if (dd) return dd.toLocaleDateString('ru-RU');
    const iso = new Date(dateStr);
    return isNaN(iso.getTime()) ? dateStr : iso.toLocaleString('ru-RU');
  }
}
