import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, PlanTask } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-plan-list',
  standalone: false,
  templateUrl: './plan-list.component.html',
  styleUrls: ['./plan-list.component.scss']
})
export class PlanListComponent implements OnInit {
  loading = false;
  plans: PlanTask[] = [];
  filters = {
    start_date: '',
    end_date: '',
    line_id: undefined as number | undefined
  };

  constructor(
    private router: Router,
    private apiService: ApiService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.loading = true;
    this.apiService.getPlanTasks(this.filters).subscribe({
      next: (response) => {
        if (response.success) {
          this.plans = response.data;
        } else {
          this.notificationService.error('Ошибка загрузки планов', response.error?.message || '');
        }
        this.loading = false;
      },
      error: () => {
        this.notificationService.error('Ошибка загрузки планов', 'Не удалось получить данные с сервера');
        this.loading = false;
      }
    });
  }

  onUpload(): void {
    this.router.navigate(['/plan/upload']);
  }

  onDownloadExcel(): void {
    const url = this.apiService.exportPlanExcel(this.filters);
    window.open(url, '_blank');
  }

  onDownloadCsv(): void {
    const url = this.apiService.exportPlanCsv(this.filters);
    window.open(url, '_blank');
  }

  onFilterChange(): void {
    this.loadPlans();
  }

  clearFilters(): void {
    this.filters = {
      start_date: '',
      end_date: '',
      line_id: undefined
    };
    this.loadPlans();
  }

  getDurationDays(startDate: string, endDate: string): number {
    const start = this.apiService.parseDate(startDate);
    const end = this.apiService.parseDate(endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
}