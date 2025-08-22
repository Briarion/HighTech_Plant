import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-stats-card',
  templateUrl: './stats-card.component.html',
  styleUrls: ['./stats-card.component.scss'],
  standalone: false
})
export class StatsCardComponent {
  @Input() title = '';
  @Input() value: number = 0;
  @Input() subtitle = '';
  @Input() icon = '';
  @Input() color: 'primary' | 'success' | 'warning' | 'danger' | 'info' = 'primary';
  @Input() trend?: {
    value: number;
    direction: 'up' | 'down';
  };
}