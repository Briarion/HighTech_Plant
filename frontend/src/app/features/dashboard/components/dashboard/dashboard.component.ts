import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import { ApiService, PlanTask, Downtime, Conflict } from '../../../../core/services/api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { RealTimeService } from '../../../../core/services/real-time.service';
import { PlanService } from '../../../../core/services/plan.service';

interface DashboardStats {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  totalDowntimes: number;
  totalConflicts: number;
  systemHealth: 'healthy' | 'warning' | 'error';
}

type DateRange = { start: Date; end: Date };

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: false
})
export class DashboardComponent implements OnInit, OnDestroy {
  Math = Math;

  // Данные для таймлайна и виджетов
  allPlanTasks: PlanTask[] = [];
  allDowntimes: Downtime[] = [];

  stats: DashboardStats = {
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    totalDowntimes: 0,
    totalConflicts: 0,
    systemHealth: 'healthy'
  };

  recentTasks: PlanTask[] = [];
  recentDowntimes: Downtime[] = [];
  recentConflicts: Conflict[] = [];

  // Диапазон дат для дочернего таймлайна
  selectedRange?: DateRange;

  // Управление загрузкой/отображением загрузчика плана
  showUpload = false;
  hasPlan = true;

  loading = true;
  private subscription = new Subscription();

  constructor(
    private apiService: ApiService,
    private notificationService: NotificationService,
    private realTimeService: RealTimeService,
    private planService: PlanService
  ) {}

  private pickArray<T>(payload: any): T[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;                 // уже массив
    if (Array.isArray(payload.data)) return payload.data;       // { data: [...] }
    if (Array.isArray(payload.results)) return payload.results; // { results: [...] } (DRF pagination)
    return [];
  }

  ngOnInit(): void {
    // стартовая загрузка: последние 30 дней
    this.loadDashboardData();

    // Проверка наличия плана в БД
    this.subscription.add(
      this.planService.checkPlanExists().subscribe({
        next: (exists: boolean) => {
          this.hasPlan = exists;
        },
        error: () => {
          this.hasPlan = false;
        }
      })
    );

    this.subscription.add(
      this.realTimeService.revision$.subscribe(() => {
        this.loadDashboardData(this.selectedRange ? {
          start_date: this.apiService.formatDate(this.selectedRange.start),
          end_date: this.apiService.formatDate(this.selectedRange.end)
        } : undefined);
      })
    );

    this.subscription.add(
      this.realTimeService.notifications$.subscribe(() => {
        // логика по уведомлениям при необходимости
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /**
   * Загрузка агрегированных данных. Если params не задан — этот и следующий год
   */
  private loadDashboardData(params?: { start_date?: string; end_date?: string }): void {
    this.loading = true;

    let start_date: string;
    let end_date: string;

    if (params?.start_date && params?.end_date) {
      start_date = params.start_date;
      end_date = params.end_date;
    } else {
      // ⬇️ ДЕФОЛТ: с начала 2025 до конца 2026
      const start = new Date(2025, 0, 1);   // 01-01-2025
      const end   = new Date(2026, 11, 31); // 31-12-2026
      start_date = this.apiService.formatDate(start); // DD-MM-YYYY
      end_date   = this.apiService.formatDate(end);
      this.selectedRange = { start, end };
    }

    const requests = forkJoin({
      tasks: this.apiService.getPlanTasks({ start_date, end_date }),
      downtimes: this.apiService.getDowntimes({ start_date, end_date }),
      conflicts: this.apiService.getConflicts(),
      health: this.apiService.healthCheck()
    });

    this.subscription.add(
      requests.subscribe({
        next: (data) => {
          const tasks = this.pickArray<PlanTask>(data.tasks);
          const dts = this.pickArray<Downtime>(data.downtimes);
          const conflicts = this.pickArray<Conflict>(data.conflicts);

          this.allPlanTasks = tasks;
          this.allDowntimes = dts;

          this.processTasksData(tasks);
          this.processDowntimesData(dts);
          this.processConflictsData(conflicts);
          this.processHealthData(data.health);

          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading dashboard data:', error);
          this.notificationService.error('Ошибка загрузки', 'Не удалось загрузить данные дашборда');
          this.loading = false;
        }
      })
    );
  }

  /**
   * Хэндлер события от таймлайна — применить/пресет/сброс дат.
   * Параметры приходят в формате DD-MM-YYYY.
   */
  reloadPlan(params: { start_date?: string; end_date?: string }): void {
    if (params.start_date && params.end_date) {
      const s = this.apiService.parseDate(params.start_date);
      const e = this.apiService.parseDate(params.end_date);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        this.selectedRange = { start: s, end: e };
      }
    } else {
      this.selectedRange = undefined;
    }
    this.loadDashboardData(params && (params.start_date || params.end_date) ? params : undefined);
  }

  private processTasksData(tasks: PlanTask[]): void {
    this.stats.totalTasks = tasks.length;

    const now = new Date();

    this.stats.activeTasks = tasks.filter(task => {
      const startDate = this.apiService.parseDate(task.start_dt);
      const endDate = this.apiService.parseDate(task.end_dt);
      return startDate <= now && endDate >= now;
    }).length;

    this.stats.completedTasks = tasks.filter(task => {
      const endDate = this.apiService.parseDate(task.end_dt);
      return endDate < now;
    }).length;

    this.recentTasks = [...tasks]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }

  private processDowntimesData(downtimes: Downtime[]): void {
    this.stats.totalDowntimes = downtimes.length;

    this.recentDowntimes = [...downtimes]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }

  private processConflictsData(conflicts: Conflict[]): void {
    this.stats.totalConflicts = conflicts.length;

    this.recentConflicts = [...conflicts]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }

  private processHealthData(healthResponse: any): void {
    if (healthResponse?.success && healthResponse?.data) {
      const health = healthResponse.data;
      if (health.status === 'healthy') this.stats.systemHealth = 'healthy';
      else if (health.status === 'degraded') this.stats.systemHealth = 'warning';
      else this.stats.systemHealth = 'error';
    } else if (healthResponse?.status) {
      const s = healthResponse.status;
      this.stats.systemHealth = s === 'healthy' ? 'healthy' : (s === 'degraded' ? 'warning' : 'error');
    } else {
      this.stats.systemHealth = 'error';
    }
  }

  onRefresh(): void {
    this.loadDashboardData(this.selectedRange ? {
      start_date: this.apiService.formatDate(this.selectedRange.start),
      end_date: this.apiService.formatDate(this.selectedRange.end)
    } : undefined);
    this.notificationService.info('Обновление', 'Данные дашборда обновлены');
  }

  onResetDb(): void {
    if (!confirm('Точно очистить ВСЕ данные в БД? Это действие необратимо.')) return;

    this.loading = true;
    this.subscription.add(
      this.apiService.resetDatabase().subscribe({
        next: (res) => {
          const anyRes = res as any;
          const ok = res?.success === true || anyRes?.status === 'ok';
          const msg = res?.data?.message ?? anyRes?.message ?? 'База данных очищена';

          if (ok) {
            this.notificationService.success('Готово', msg);
            this.loadDashboardData(this.selectedRange ? {
              start_date: this.apiService.formatDate(this.selectedRange.start),
              end_date: this.apiService.formatDate(this.selectedRange.end)
            } : undefined);
            this.hasPlan = false; // после сброса — нет плана
          } else {
            const emsg = res?.error?.message || 'Не удалось выполнить сброс БД';
            this.notificationService.error('Ошибка', emsg);
            this.loading = false;
          }
        },
        error: (err) => {
          const emsg =
            err?.error?.error?.message ||
            err?.error?.message ||
            'Не удалось выполнить сброс БД';
          console.error('DB reset error:', err);
          this.notificationService.error('Ошибка', emsg);
          this.loading = false;
        }
      })
    );
  }

  /** Показать форму загрузки плана (например, по кнопке «Загрузить план») */
  onShowUpload(): void {
    this.showUpload = true;
  }

  /** Хэндлер после успешной загрузки плана */
  onUploadFinished(): void {
    this.showUpload = false;
    this.hasPlan = true;
    this.loadDashboardData(this.selectedRange ? {
      start_date: this.apiService.formatDate(this.selectedRange.start),
      end_date: this.apiService.formatDate(this.selectedRange.end)
    } : undefined);
  }
}
