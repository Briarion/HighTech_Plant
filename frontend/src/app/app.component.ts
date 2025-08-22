import { Component, OnInit, OnDestroy } from '@angular/core';
import { environment } from '../environments/environment';
import { SseNotificationsService } from './core/services/sse-notifications.service';
import { Subscription } from 'rxjs';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styles: [],
  standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  title = environment.appName;
  private sub?: Subscription;

  constructor(
    private sse: SseNotificationsService,
    private toasts: NotificationService,
  ) {}

  ngOnInit(): void {
    document.title = this.title;
    if (!environment.production) {
      console.log(`🚀 ${this.title} v${environment.version} запущен в режиме разработки`);
    }

    // Открываем одно соединение SSE на всё приложение
    this.sse.connect();

    // Маппим входящие серверные уведомления в ваши тосты
    this.sub = this.sse.events$.subscribe(evt => {
      if (!evt) return;
      const title = evt.code || 'Уведомление';
      const msg = evt.text || JSON.stringify(evt);

      switch (evt.level) {
        case 'success':
          this.toasts.success(title, msg, evt);
          break;
        case 'error':
          this.toasts.error(title, msg, evt);
          break;
        case 'warning':
          this.toasts.warning(title, msg, evt);
          break;
        default:
          this.toasts.info(title, msg, evt);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.sse.close();
  }
}
