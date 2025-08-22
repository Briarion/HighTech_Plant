import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-system-status',
  templateUrl: './system-status.component.html',
  styleUrls: ['./system-status.component.scss'],
  standalone: false
})
export class SystemStatusComponent {
  @Input() status: 'healthy' | 'warning' | 'error' = 'healthy';
  @Input() title = 'Состояние системы';

  get statusText(): string {
    switch (this.status) {
      case 'healthy': return 'Система работает';
      case 'warning': return 'Есть предупреждения';
      case 'error': return 'Ошибка системы';
      default: return 'Неизвестно';
    }
  }

  get statusIcon(): string {
    switch (this.status) {
      case 'healthy': return 'check-circle';
      case 'warning': return 'exclamation-triangle';
      case 'error': return 'exclamation-circle';
      default: return 'question-circle';
    }
  }
}