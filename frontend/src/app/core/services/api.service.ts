import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { of, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { map, catchError } from 'rxjs/operators';

// Базовые типы ответов API
export interface ApiResponse<T = any> {
  message: string | undefined;
  status: string;
  success: boolean;
  data: T;
  error: {
    code: string;
    message: string;
    details: any;
  } | null;
}

export interface PlanTask {
  id: number;
  line?: {
    id: number;
    name: string;
    aliases: string[];
  } | null;
  product?: {
    id: number;
    name: string;
    code: string;
  } | null;
  title: string;
  start_dt: string;  // DD-MM-YYYY
  end_dt: string;    // DD-MM-YYYY
  source: string;
  created_at: string;
  updated_at: string;
}

export interface PlanUploadResponse {
  created: number;
  updated: number;
  warnings: string[];
  processing_time_ms: number;
  file_hash: string;
}

export interface Downtime {
  id: number;
  line: {
    id: number;
    name: string;
  } | null;
  start_dt: string;  // DD-MM-YYYY
  end_dt: string;    // DD-MM-YYYY
  status: string;
  kind: string;
  source_file: string;
  evidence_quote: string;
  evidence_location: string;
  confidence: number;
  partial_date_start: boolean;
  partial_date_end: boolean;
  notes: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Conflict {
  id: string;
  level: string;
  code: string;
  text: string;
  plan_task: PlanTask;
  downtime: Downtime;
  overlap_start: string;
  overlap_end: string;
  priority_status: string;
  created_at: string;
}

export interface ScanJobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  started_at: string;
  completed_at?: string;
  result?: {
    downtimes_extracted: number;
    files_processed: number;
    conflicts_detected: number;
  };
  error_message?: string;
}

export interface ResetDbPayload {
  message?: string;
}


@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private normalizeList<T>(res: any): T[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;                 // уже массив
    if (Array.isArray(res?.data)) return res.data;      // { data: [...] }
    if (Array.isArray(res?.results)) return res.results;// { results: [...] } (DRF pagination)
    return [];
  }

  // Планы производства
  getPlanTasks(params?: {
    line_id?: number;
    start_date?: string;
    end_date?: string;
  }): Observable<ApiResponse<PlanTask[]>> {
    let httpParams = new HttpParams();
    if (params) {
      if (params.line_id != null) httpParams = httpParams.set('line_id', String(params.line_id));
      if (params.start_date) httpParams = httpParams.set('start_date', params.start_date);
      if (params.end_date) httpParams = httpParams.set('end_date', params.end_date);
    }

    return this.http.get<any>(`${this.baseUrl}/plan/`, { params: httpParams }).pipe(
      map(res => ({
        success: true,
        data: this.normalizeList<PlanTask>(res)
      }) as ApiResponse<PlanTask[]>),
      catchError(err => of({
        success: false,
        data: [],
        error: {
          message: err?.error?.error?.message ||
            err?.error?.message ||
            err?.message ||
            'Не удалось загрузить план'
        }
      } as unknown as ApiResponse<PlanTask[]>))
    );
  }

  uploadPlanFile(file: File): Observable<ApiResponse<PlanUploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<ApiResponse<PlanUploadResponse>>(`${this.baseUrl}/plan/upload/`, formData);
  }

  // Простои
  getDowntimes(params?: {
    line_id?: number;
    start_date?: string;
    end_date?: string;
    status?: string;
    kind?: string;
    source?: string;
    min_confidence?: number;
  }): Observable<ApiResponse<Downtime[]>> {
    let httpParams = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') httpParams = httpParams.set(k, String(v));
      }
    }

    return this.http.get<any>(`${this.baseUrl}/downtimes/`, { params: httpParams }).pipe(
      map(res => ({
        success: true,
        data: this.normalizeList<Downtime>(res)
      }) as ApiResponse<Downtime[]>),
      catchError(err => of({
        success: false,
        data: [],
        error: {
          message: err?.error?.error?.message ||
            err?.error?.message ||
            err?.message ||
            'Не удалось загрузить простои'
        }
      } as unknown as ApiResponse<Downtime[]>))
    );
  }

  // Конфликты
  getConflicts(): Observable<ApiResponse<Conflict[]>> {
    return this.http.get<ApiResponse<Conflict[]>>(`${this.baseUrl}/conflicts/`);
  }

  // Линии производства
  getProductionLines(): Observable<ApiResponse<any[]>> {
    return this.http.get<ApiResponse<any[]>>(`${this.baseUrl}/lines/`);
  }

  // Асинхронное сканирование
  startScan(folderPath: string = '/app/data/minutes'): Observable<ApiResponse<{ job_id: string; status: string }>> {
    return this.http.post<ApiResponse<any>>(`${this.baseUrl}/minutes/scan/`, {
      folder_path: folderPath
    });
  }

  getScanStatus(jobId: string): Observable<ApiResponse<ScanJobStatus>> {
    return this.http.get<ApiResponse<ScanJobStatus>>(`${this.baseUrl}/minutes/scan/${jobId}/`);
  }

  // Экспорт планов
  exportPlanExcel(params?: {
    start_date?: string;
    end_date?: string;
    line_id?: number;
  }): string {
    let httpParams = new HttpParams();
    if (params) {
      if (params.start_date) httpParams = httpParams.set('start_date', params.start_date);
      if (params.end_date) httpParams = httpParams.set('end_date', params.end_date);
      if (params.line_id) httpParams = httpParams.set('line_id', params.line_id.toString());
    }
    
    return `${this.baseUrl}/export/plan.xlsx?${httpParams.toString()}`;
  }

  exportPlanCsv(params?: {
    start_date?: string;
    end_date?: string;
    line_id?: number;
  }): string {
    let httpParams = new HttpParams();
    if (params) {
      if (params.start_date) httpParams = httpParams.set('start_date', params.start_date);
      if (params.end_date) httpParams = httpParams.set('end_date', params.end_date);
      if (params.line_id) httpParams = httpParams.set('line_id', params.line_id.toString());
    }
    
    return `${this.baseUrl}/export/plan.csv?${httpParams.toString()}`;
  }

  // Проверка здоровья
  healthCheck(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/health/`);
  }

  // Вспомогательные методы
  formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }


  resetDatabase(): Observable<ApiResponse<ResetDbPayload>> {
    return this.http.post<ApiResponse<ResetDbPayload>>(
      `${this.baseUrl}/reset-db/`,
      {}
    );
  }
}