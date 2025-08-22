import { Component, Input } from '@angular/core';
import { PlanTask, Downtime, Conflict } from '../../../../core/services/api.service';

interface ActivityItem {
  id: string;
  type: 'task' | 'downtime' | 'conflict';
  title: string;
  description: string;
  timestamp: Date;
  status: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-recent-activities',
  templateUrl: './recent-activities.component.html',
  styleUrls: ['./recent-activities.component.scss'],
  standalone: false
})
export class RecentActivitiesComponent {
  @Input() tasks: PlanTask[] = [];
  @Input() downtimes: Downtime[] = [];
  @Input() conflicts: Conflict[] = [];

  get activities(): ActivityItem[] {
    const activities: ActivityItem[] = [];

    // Add tasks
    this.tasks.forEach(task => {
      activities.push({
        id: `task-${task.id}`,
        type: 'task',
        title: task.title,
        description: `${task.line?.name ?? 'Линия —'} • ${task.start_dt} - ${task.end_dt}`,
        timestamp: new Date(task.created_at),
        status: 'task',
        icon: 'calendar',
        color: 'primary'
      });
    });

    // Add downtimes
    this.downtimes.forEach(downtime => {
      activities.push({
        id: `downtime-${downtime.id}`,
        type: 'downtime',
        title: `Простой: ${downtime.kind}`,
        description: `${downtime.line?.name || 'Неизвестная линия'} • ${downtime.start_dt} - ${downtime.end_dt}`,
        timestamp: new Date(downtime.created_at),
        status: downtime.status,
        icon: 'warning',
        color: 'warning'
      });
    });

    // Add conflicts
    this.conflicts.forEach(conflict => {
      activities.push({
        id: `conflict-${conflict.id}`,
        type: 'conflict',
        title: `Конфликт: ${conflict.code}`,
        description: conflict.text,
        timestamp: new Date(conflict.created_at),
        status: conflict.level,
        icon: 'alert',
        color: 'danger'
      });
    });

    // Sort by timestamp (newest first)
    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  formatTime(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    return `${days} дн назад`;
  }
}