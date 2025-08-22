import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

export interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  autoClose?: boolean;
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<NotificationItem[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  private readonly MAX_NOTIFICATIONS = 100;

  addNotification(notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): void {
    const newNotification: NotificationItem = {
      ...notification,
      id: this.generateId(),
      timestamp: new Date(),
      read: false,
    };

    const updated = [newNotification, ...this.notificationsSubject.value];
    if (updated.length > this.MAX_NOTIFICATIONS) updated.splice(this.MAX_NOTIFICATIONS);
    this.notificationsSubject.next(updated);

    if (notification.autoClose) {
      setTimeout(() => this.removeNotification(newNotification.id), 5000);
    }
  }

  removeNotification(id: string): void {
    this.notificationsSubject.next(this.notificationsSubject.value.filter(n => n.id !== id));
  }

  markAsRead(id: string): void {
    this.notificationsSubject.next(
      this.notificationsSubject.value.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }

  markAllAsRead(): void {
    this.notificationsSubject.next(this.notificationsSubject.value.map(n => ({ ...n, read: true })));
  }

  clearAll(): void { this.notificationsSubject.next([]); }

  getUnreadCount(): Observable<number> {
    return this.notifications$.pipe(
      map(list => list.filter(n => !n.read).length),
      distinctUntilChanged()
    );
  }

  // Convenience
  success(title: string, message: string, data?: any): void {
    this.addNotification({ type: 'success', title, message, data, autoClose: true });
  }
  error(title: string, message: string, data?: any): void {
    this.addNotification({ type: 'error', title, message, data, autoClose: false });
  }
  warning(title: string, message: string, data?: any): void {
    this.addNotification({ type: 'warning', title, message, data, autoClose: false });
  }
  info(title: string, message: string, data?: any): void {
    this.addNotification({ type: 'info', title, message, data, autoClose: true });
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
