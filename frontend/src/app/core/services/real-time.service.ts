import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { SseNotificationsService, ServerNotification } from './sse-notifications.service';

export interface SSENotification extends ServerNotification {
  // оставлено для совместимости; структура совпадает
}

@Injectable({ providedIn: 'root' })
export class RealTimeService implements OnDestroy {
  // ревизии данных для реактивных обновлений
  private revisionSubject = new BehaviorSubject<number>(0);
  public readonly revision$ = this.revisionSubject.asObservable().pipe(distinctUntilChanged());

  // проксируем статус соединения из SseNotificationsService
  public readonly connectionStatus$ = this.sse.status$;

  // поток уведомлений (совместимость с твоим кодом)
  private notificationSubject = new Subject<SSENotification>();
  public readonly notifications$ = this.notificationSubject.asObservable();

  private sub = new Subscription();

  constructor(
    private sse: SseNotificationsService,
    private notificationService: NotificationService,
  ) {
    // Реакция на входящие события
    this.sub.add(
      this.sse.events$.pipe(filter((e): e is SSENotification => !!e)).subscribe((n) => {
        this.notificationSubject.next(n);
        this.showNotificationToUser(n);
        this.handleSpecialNotifications(n);
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** Инициализация канала (делегируем вниз) */
  public connect(): void {
    this.sse.connect();
  }

  /** Принудительное обновление данных */
  public triggerDataUpdate(): void {
    this.incrementRevision();
  }

  /** Текущая ревизия */
  public getCurrentRevision(): number {
    return (this.revisionSubject as any).value as number;
  }

  // === приватные ===
  private handleSpecialNotifications(notification: SSENotification): void {
    switch (notification.code) {
      case 'CONFLICT_DETECTED':
      case 'PLAN_DATE_COERCED':
        this.incrementRevision();
        break;
      default:
        break;
    }
  }

  private showNotificationToUser(n: SSENotification): void {
    const title = this.getNotificationTitle(n.code);
    switch (n.level) {
      case 'success': this.notificationService.success(title, n.text, n.payload); break;
      case 'warning': this.notificationService.warning(title, n.text, n.payload); break;
      case 'error':   this.notificationService.error(title, n.text, n.payload);   break;
      case 'info':
      default:        this.notificationService.info(title, n.text, n.payload);    break;
    }
  }

  private getNotificationTitle(code: string): string {
    const dict: Record<string, string> = {
      'CONFLICT_DETECTED': 'Обнаружен конфликт',
      'PLAN_DATE_COERCED': 'Дата скорректирована',
      'MINUTES_DUPLICATE_FILE': 'Дубликат файла',
      'LLM_TIMEOUT': 'Таймаут LLM',
      'LLM_UNAVAILABLE': 'LLM недоступен',
      'VALIDATION_ERROR': 'Ошибка валидации',
      'NOT_FOUND': 'Ресурс не найден',
      'UNSUPPORTED_MEDIA_TYPE': 'Неподдерживаемый формат',
      'PAYLOAD_TOO_LARGE': 'Файл слишком большой',
      'ALIAS_UNKNOWN': 'Неизвестный псевдоним',
      'EXPORT_EMPTY': 'Нет данных для экспорта',
    };
    return dict[code] ?? 'Системное уведомление';
  }

  private incrementRevision(): void {
    const cur = this.getCurrentRevision();
    this.revisionSubject.next(cur + 1);
  }
}
