import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { ApiResponse } from '@app/core/services/api.service';

export interface ScanJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  results?: {
    downtimes_found: number;
    conflicts_created: number;
    documents_processed: number;
  };
  created_at: string;
  completed_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ScanService {
  private base = '/api'; // или environment.apiUrl

  constructor(private http: HttpClient) {}

  start(): Observable<ApiResponse<ScanJob>> {
    return this.http.post<ApiResponse<ScanJob>>(`${this.base}/scan-jobs/start/`, {});
  }

  get(jobId: string): Observable<ApiResponse<ScanJob>> {
    return this.http.get<ApiResponse<ScanJob>>(`${this.base}/scan-jobs/${jobId}/`);
  }

  list(): Observable<ApiResponse<ScanJob[]>> {
    return this.http.get<ApiResponse<ScanJob[]>>(`${this.base}/scan-jobs/`);
  }

  poll(jobId: string, intervalMs = 1000): Observable<ApiResponse<ScanJob>> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.get(jobId)),
      takeWhile(resp =>
        resp.data.status === 'running' || resp.data.status === 'pending',
        true
      )
    );
  }
}