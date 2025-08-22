import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

export type UploadResponse = {
  success: boolean;
  data?: {
    created: number;
    updated: number;
    warnings: string[];
    processing_time_ms: number;
    file_hash: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
};

@Injectable({ providedIn: 'root' })
export class PlanService {
  private baseUrl = '/api/plan'; // при необходимости вынеси в environment

  constructor(private http: HttpClient) {}

  /**
   * Проверка наличия хотя бы одного плана в БД.
   * Возвращает true, если count > 0.
   */
  checkPlanExists(): Observable<boolean> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/`).pipe(
      map(res => res.count > 0),
      catchError(() => of(false)) // если ошибка, считаем что плана нет
    );
  }

  /**
   * Загрузка нового плана в формате Excel
   */
  uploadPlan(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UploadResponse>(`${this.baseUrl}/upload/`, formData);
  }
}
