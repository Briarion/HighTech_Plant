import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../services/loading.service';

@Injectable()
export class LoadingInterceptor implements HttpInterceptor {
  constructor(private loadingService: LoadingService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Пропускаем запросы на проверку здоровья, чтобы избежать мигания индикатора
    if (request.url.includes('/health/') || request.url.includes('/status/')) {
      return next.handle(request);
    }

    // Показываем индикатор загрузки
    this.loadingService.setLoading(true);

    return next.handle(request).pipe(
      finalize(() => {
        // Скрываем индикатор загрузки после завершения запроса
        this.loadingService.setLoading(false);
      })
    );
  }
}