import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
  standalone: false
})
export class ConfirmDialogComponent {
  @Input() show = false;
  @Input() data: ConfirmDialogData = {
    title: 'Подтверждение',
    message: 'Вы уверены?',
    confirmText: 'Подтвердить',
    cancelText: 'Отмена',
    type: 'info'
  };

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  getTypeIcon(): string {
    const icons = {
      info: 'info-circle',
      warning: 'exclamation-triangle',
      error: 'exclamation-circle',
      success: 'check-circle'
    };
    return icons[this.data.type || 'info'];
  }

  getTypeColor(): string {
    const colors = {
      info: '#1890ff',
      warning: '#faad14',
      error: '#ff4d4f',
      success: '#52c41a'
    };
    return colors[this.data.type || 'info'];
  }
}