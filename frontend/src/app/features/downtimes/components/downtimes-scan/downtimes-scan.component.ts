import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ScanService, ScanJob } from '../../../../core/services/scan.service';
import { finalize } from 'rxjs/operators';
import { ApiResponse } from '@app/core/services/api.service';

@Component({
  selector: 'app-downtimes-scan',
  standalone: false,
  templateUrl: './downtimes-scan.component.html',
  styleUrls: ['./downtimes-scan.component.scss']
})
export class DowntimesScanComponent implements OnInit {
  currentJob: ScanJob | null = null;
  jobHistory: ScanJob[] = [];
  loading = false;
  error = '';
  Math = Math;

  constructor(private router: Router, private scanApi: ScanService) {}

  ngOnInit(): void {
    this.loadJobHistory();
  }

  loadJobHistory(): void {
    this.loading = true;
    this.scanApi.list()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe(
        (resp: ApiResponse<ScanJob[]>) => {
          this.jobHistory = resp.data || [];
        },
        (err: any) => {
          this.error = 'Не удалось загрузить историю';
          console.error(err);
        }
      );
  }

  startScan(): void {
    if (this.currentJob && this.currentJob.status === 'running') return;

    this.error = '';
    this.scanApi.start().subscribe({
      next: (resp: ApiResponse<ScanJob>) => {
        this.currentJob = resp.data;

        if (this.currentJob?.id) {
          this.scanApi.poll(this.currentJob.id, 1000).subscribe({
            next: (s: ApiResponse<ScanJob>) => {
              this.currentJob = s.data;
              if (this.currentJob?.status === 'completed') {
                this.jobHistory.unshift({ ...this.currentJob });
              }
            },
            error: (err: any) => {
              this.error = 'Ошибка при получении статуса сканирования';
              console.error(err);
            }
          });
        }
      },
      error: (err: any) => {
        this.error = 'Не удалось запустить сканирование';
        console.error(err);
      }
    });
  }

  onBack(): void { this.router.navigate(['/downtimes']); }
  onViewResults(): void { this.router.navigate(['/downtimes']); }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return 'check';
      case 'running': return 'refresh';
      case 'failed': return 'warning';
      case 'pending': return 'clock';
      default: return 'info';
    }
  }
  getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'primary';
      case 'failed': return 'danger';
      case 'pending': return 'warning';
      default: return 'secondary';
    }
  }
  formatDateTime(dateStr: string): string { return new Date(dateStr).toLocaleString('ru-RU'); }
  getDuration(job: ScanJob): string {
    if (!job.completed_at) return '-';
    const start = new Date(job.created_at).getTime();
    const end = new Date(job.completed_at).getTime();
    const diffSec = Math.floor((end - start) / 1000);
    return diffSec < 60 ? `${diffSec} сек.` : `${Math.floor(diffSec / 60)} мин.`;
  }
}