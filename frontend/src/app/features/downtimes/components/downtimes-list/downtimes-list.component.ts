import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DowntimeService, UIDowntime } from '../../../../core/services/downtime.service';

@Component({
  selector: 'app-downtimes-list',
  standalone: false,
  templateUrl: './downtimes-list.component.html',
  styleUrls: ['./downtimes-list.component.scss']
})
export class DowntimesListComponent implements OnInit {
  downtimes: UIDowntime[] = [];
  loading = false;
  error = '';

  // для шаблона
  Math = Math;

  constructor(
    private router: Router,
    private downtimesSvc: DowntimeService,
  ) {}

  ngOnInit(): void {
    this.loadDowntimes();
  }

  loadDowntimes(): void {
    this.loading = true;
    this.error = '';
    this.downtimesSvc.list({
      // проброс фильтров при необходимости:
      // start_date: '01-08-2025',
      // end_date: '31-08-2025',
      // min_confidence: 0.7,
      // line_id: 1,
      // status: 'утверждено',
      // kind: 'обслуживание',
      // source: 'llm',
    }).subscribe(res => {
      this.loading = false;
      if (res.success) {
        this.downtimes = res.items;
      } else {
        this.error = res.error || 'Не удалось загрузить простои';
      }
    });
  }

  onDowntimeClick(d: UIDowntime): void {
    this.router.navigate(['/downtimes', d.id]);
  }

  onRefresh(): void {
    this.loadDowntimes();
  }

  onStartScan(): void {
    this.router.navigate(['/downtimes/scan']);
  }

  /** Статус → CSS-класс с приоритетной окраской */
  getStatusClass(status?: string): string {
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

  /** Источник → CSS-класс */
  getSourceClass(source?: string): string {
    const s = (source || '').toLowerCase();
    switch (s) {
      case 'llm':      return 'source-llm';
      case 'fallback': return 'source-fallback';
      case 'manual':   return 'source-manual';
      default:         return 'source-unknown';
    }
  }

  /** Источник → короткая подпись */
  getSourceLabel(source?: string): string {
    const s = (source || '').toLowerCase();
    if (s === 'llm') return 'LLM';
    if (s === 'fallback') return 'Парсер';
    if (s === 'manual') return 'Ручной';
    return 'Источник?';
    }

  /** Источник → иконка */
  getSourceIcon(source?: string): string {
    const s = (source || '').toLowerCase();
    if (s === 'llm') return 'bot';
    if (s === 'fallback') return 'cog';
    if (s === 'manual') return 'user';
    return 'question';
  }

  /** Уверенность → уровень */
  getConfidenceLevel(conf?: number): 'high' | 'medium' | 'low' | 'unknown' {
    if (conf === undefined || conf === null) return 'unknown';
    if (conf >= 0.9) return 'high';
    if (conf >= 0.7) return 'medium';
    return 'low';
  }

  /** Для полоски уверенности (0..100) */
  confidencePct(conf?: number): number {
    if (!conf && conf !== 0) return 0;
    const v = Math.round(conf * 100);
    return Math.min(100, Math.max(0, v));
  }

  /** Приоритет статуса (мнемоника для конфликта/важности) */
  statusPriority(status?: string): number {
    const s = (status || '').toLowerCase();
    const pr: Record<string, number> = {
      'утверждено': 5,
      'выполнено': 4,
      'план': 3,
      'предложение': 2,
      'обсуждение': 1,
    };
    return pr[s] ?? 0;
  }

  /** DD-MM-YYYY → Date (UTC) */
  private parseDDMMYYYY(x: string): Date | null {
    if (!x) return null;
    const parts = x.split('-');
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts.map(Number);
    if (!dd || !mm || !yyyy) return null;
    return new Date(Date.UTC(yyyy, mm - 1, dd));
  }

  formatDate(dateStr: string, partial = false): string {
    // DD-MM-YYYY
    const ddmmyyyy = this.parseDDMMYYYY(dateStr);
    if (ddmmyyyy) {
      const base = ddmmyyyy.toLocaleDateString('ru-RU');
      return partial ? `~${base}` : base;
    }
    // ISO/другое
    const d = new Date(dateStr);
    const base = isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('ru-RU');
    return partial ? `~${base}` : base;
  }

  formatDateTime(dateStr: string): string {
    // если DD-MM-YYYY — просто дата
    const ddmmyyyy = this.parseDDMMYYYY(dateStr);
    if (ddmmyyyy) return ddmmyyyy.toLocaleDateString('ru-RU');

    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString('ru-RU');
  }

  pluralizeDays(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
    return 'дней';
  }

  truncate(s: string, max = 140): string {
    if (!s) return '';
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
  }

  isUrl(path?: string): boolean {
    if (!path) return false;
    return /^https?:\/\//i.test(path);
  }

  openSourceFile(d: UIDowntime, ev?: MouseEvent): void {
    ev?.stopPropagation();
    if (this.isUrl(d.source_file)) {
      window.open(d.source_file, '_blank');
    }
  }

  copyText(text: string, ev?: MouseEvent): void {
    ev?.stopPropagation();
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  }
}
