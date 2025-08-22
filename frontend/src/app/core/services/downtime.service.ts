import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService, Downtime, ApiResponse } from './api.service';
export interface UIDowntime extends Downtime {
  duration_days: number;
  line_name: string;
}

@Injectable({ providedIn: 'root' })
export class DowntimeService {
  constructor(private api: ApiService) {}

  /**
   * Загрузка простоев с базового API + адаптация под UI.
   */
  list(params?: {
    line_id?: number;
    start_date?: string;   // DD-MM-YYYY
    end_date?: string;     // DD-MM-YYYY
    status?: string;
    kind?: string;
    source?: string;
    min_confidence?: number;
  }): Observable<{ success: boolean; items: UIDowntime[]; error?: string }> {
    return this.api.getDowntimes(params).pipe(
      map((res: ApiResponse<Downtime[]>) => {
        const items = (res?.data || []).map(d => this.toUI(d));
        return { success: true, items };
      }),
      catchError(err =>
        of({
          success: false,
          items: [],
          error:
            err?.error?.error?.message ||
            err?.error?.message ||
            err?.message ||
            'Не удалось загрузить простои',
        })
      )
    );
  }

  /** Преобразование одной записи API -> удобная запись для списка */
  private toUI(d: Downtime): UIDowntime {
    const duration_days = this.diffDaysInclusive(d.start_dt, d.end_dt);
    const line_name = d.line?.name ?? `Линия ${d.line?.id ?? '—'}`;
    return { ...d, duration_days, line_name };
  }

  /** Разница в днях (включительно) для дат в формате DD-MM-YYYY */
  private diffDaysInclusive(start: string, end: string): number {
    const s = this.parseDDMMYYYY(start);
    const e = this.parseDDMMYYYY(end);
    if (!s || !e) return 0;
    const ms = e.getTime() - s.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return days + 1; // включительно
  }

  /** Парсер DD-MM-YYYY (без влияния таймзоны) */
  private parseDDMMYYYY(x: string): Date | null {
    if (!x) return null;
    const [dd, mm, yyyy] = x.split('-').map(Number);
    if (!dd || !mm || !yyyy) return null;
    // создаём дату в UTC, чтобы не «плавала» в локалях/таймзонах
    return new Date(Date.UTC(yyyy, mm - 1, dd));
  }
}
