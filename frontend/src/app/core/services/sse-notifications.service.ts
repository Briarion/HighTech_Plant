import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ServerNotification {
  id: number;
  created_at: string;
  level: 'info' | 'warning' | 'error' | 'success' | string;
  code: string;
  text: string;
  payload?: any;
}

type ConnState = 'disconnected' | 'connecting' | 'open' | 'error';

@Injectable({ providedIn: 'root' })
export class SseNotificationsService implements OnDestroy {
  private es?: EventSource;
  private sinceId = 0;
  private readonly SINCE_KEY = 'sse_since_id';

  private backoffMs = 1000;      // экспоненциальный бэкофф (до 30s)
  private reconnectTimer?: any;

  private statusSubject = new BehaviorSubject<ConnState>('disconnected');
  public readonly status$: Observable<ConnState> = this.statusSubject.asObservable();

  private eventsSubject = new BehaviorSubject<ServerNotification | null>(null);
  public readonly events$: Observable<ServerNotification | null> = this.eventsSubject.asObservable();

  constructor(private zone: NgZone) {
    const saved = sessionStorage.getItem(this.SINCE_KEY);
    if (saved) this.sinceId = Number(saved) || 0;
  }

  ngOnDestroy(): void {
    this.close();
  }

  connect(): void {
    // Идемпотентность: если уже open/connecting — выходим
    if (this.es && (this.es.readyState === EventSource.OPEN || this.es.readyState === EventSource.CONNECTING)) {
      return;
    }

    this.clearReconnect();
    this.statusSubject.next('connecting');

    // ЕДИНЫЙ способ формирования URL
    const base = `${environment.apiUrl}/stream/notifications/`.replace(/\/+$/,'/') ;
    const url = this.sinceId > 0 ? `${base}?since_id=${this.sinceId}` : base;

    try {
      this.es = new EventSource(url, { withCredentials: true });

      this.es.onopen = () => {
        this.zone.run(() => {
          this.statusSubject.next('open');
          this.backoffMs = 1000;
          // console.debug('[SSE] open');
        });
      };

      // именованное событие
      this.es.addEventListener('notification', (ev: MessageEvent) => {
        this.zone.run(() => this.pushEvent(ev));
      });

      // fallback, если на бэке нет event: notification
      this.es.onmessage = (ev: MessageEvent) => {
        this.zone.run(() => this.pushEvent(ev));
      };

      this.es.onerror = () => {
        this.zone.run(() => {
          this.statusSubject.next('error');
          this.scheduleReconnect();
        });
      };

    } catch (e) {
      this.statusSubject.next('error');
      this.scheduleReconnect();
    }
  }

  close(): void {
    if (this.es) {
      this.es.close();
      this.es = undefined;
    }
    this.clearReconnect();
    this.statusSubject.next('disconnected');
  }

  private pushEvent(ev: MessageEvent) {
    try {
      const data: ServerNotification = JSON.parse(ev.data);
      const idFromHeader = ev.lastEventId ? parseInt(ev.lastEventId, 10) : NaN;
      const id = Number.isNaN(idFromHeader) ? data?.id : idFromHeader;

      if (typeof id === 'number' && id > this.sinceId) {
        this.sinceId = id;
        sessionStorage.setItem(this.SINCE_KEY, String(id));
      }
      this.eventsSubject.next(data);
    } catch {
      // игнорируем битое сообщение
    }
  }

  private scheduleReconnect() {
    this.close(); // гарантированно закрываем
    const delay = Math.min(this.backoffMs, 30000);
    this.backoffMs = Math.min(this.backoffMs * 2, 30000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
