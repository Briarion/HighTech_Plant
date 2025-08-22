import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PlanTask, Downtime } from '../../../../core/services/api.service';
import { RealTimeService } from '../../../../core/services/real-time.service';

interface TimelineMonth {
  month: number;   // 1..12
  year: number;    // YYYY
  name: string;
  shortName: string;
}

interface TimelineTask {
  id: number;
  title: string;
  startMonth: number;
  endMonth: number;
  startYear: number;
  endYear: number;
  color: string;
  product: string;
  line: string;
}

interface TimelineDowntime {
  id: number;
  startMonth: number;
  endMonth: number;
  startYear: number;
  endYear: number;
  kind: string;
  status: string;
  line: string;
}

/** Строка сетки = конкретный продукт конкретной линии */
interface ProductRow {
  line: string;
  product: string;
  key: string; // `${line}__${product}`
}

@Component({
  selector: 'app-plan-timeline',
  templateUrl: './plan-timeline.component.html',
  styleUrls: ['./plan-timeline.component.scss'],
  standalone: false
})
export class PlanTimelineComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  // Входные данные
  @Input() planTasks: PlanTask[] = [];
  @Input() downtimes: Downtime[] = [];
  @Input() selectedDateRange?: { start: Date; end: Date };

  // Родителю: запрос перезагрузки с параметрами (DD-MM-YYYY)
  @Output() loadRequested = new EventEmitter<{ start_date?: string; end_date?: string }>();

  // Локальный выбранный диапазон (по кнопке «Применить»/пресетам)
  private activeDateRange?: { start: Date; end: Date };

  // Модели для <input type="date">
  dateStartModel: string | null = null;
  dateEndModel: string | null = null;

  // Данные для рендера
  timelineMonths: TimelineMonth[] = [];
  timelineTasks: TimelineTask[] = [];           // задачи, пересекающиеся с диапазоном
  timelineDowntimes: TimelineDowntime[] = [];   // простои, пересекающиеся с диапазоном
  productRows: ProductRow[] = [];               // строки: уникальные (line, product)
  hasPlanData = false;                          // есть ли задачи плана в диапазоне

  // Цвета задач по стартовому месяцу
  readonly TASK_COLORS = ['#52c41a', '#1890ff', '#faad14']; // Jan-Apr, May-Jul, Aug-Dec

  private subscription = new Subscription();

  constructor(private realTimeService: RealTimeService) {}

  // ===== Жизненный цикл =====

  ngOnInit(): void {
    // Инициализируем поля дат из входного selectedDateRange (если он задан)
    if (this.selectedDateRange?.start) this.dateStartModel = this.toInputDate(this.selectedDateRange.start);
    if (this.selectedDateRange?.end)   this.dateEndModel   = this.toInputDate(this.selectedDateRange.end);

    // Реалтайм-уведомления (родитель обновит данные; здесь просто лог)
    this.subscription.add(
      this.realTimeService.notifications$.subscribe(n => {
        if (n.code === 'CONFLICT_DETECTED' || n.code === 'PLAN_DATE_COERCED') {
          console.log('Timeline refresh triggered by notification:', n.code);
        }
      })
    );
  }

  ngAfterViewInit(): void {
    this.updateTimelineData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['planTasks'] || changes['downtimes'] || changes['selectedDateRange']) {
      // синхронизируем инпуты, если родитель прислал новый selectedDateRange
      if (changes['selectedDateRange']?.currentValue) {
        const rng = changes['selectedDateRange'].currentValue as { start: Date; end: Date };
        this.dateStartModel = this.toInputDate(rng.start);
        this.dateEndModel   = this.toInputDate(rng.end);
      }
      this.updateTimelineData();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // ===== Панель выбора дат =====

  applyDateFilter(): void {
    const start = this.fromInputDate(this.dateStartModel);
    const end   = this.fromInputDate(this.dateEndModel);

    if (start && end && start <= end) {
      this.activeDateRange = { start, end };
    } else {
      this.activeDateRange = undefined;
    }

    this.loadRequested.emit({
      start_date: start ? this.formatDDMMYYYY(start) : undefined,
      end_date:   end   ? this.formatDDMMYYYY(end)   : undefined
    });
  }

  clearDateFilter(): void {
    this.dateStartModel = null;
    this.dateEndModel   = null;
    this.activeDateRange = undefined;
    this.loadRequested.emit({});
  }

  presetThisYear(): void {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end   = new Date(now.getFullYear(), 11, 31);
    this.dateStartModel = this.toInputDate(start);
    this.dateEndModel   = this.toInputDate(end);
    this.applyDateFilter();
  }

  presetLast6Months(): void {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const endLastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    this.dateStartModel = this.toInputDate(start);
    this.dateEndModel   = this.toInputDate(endLastDay);
    this.applyDateFilter();
  }

  // ===== Построение данных =====

  /** Главный пересчёт состояния компонента */
  private updateTimelineData(): void {
    const range = this.activeDateRange ?? this.selectedDateRange;

    // 1) Фильтруем задачи/простои по выбранному диапазону (включительно)
    const normalizedTasks = this.planTasks.map(t => this.normalizeTask(t));
    const filteredTasks = normalizedTasks.filter(t => this.isTaskInRange(t, range));
    const filteredDowntimes = this.downtimes.filter(d => this.isDowntimeInRange(d as any, range));

    // 2) Если задач нет — чистим всё и показываем пустое состояние
    this.hasPlanData = filteredTasks.length > 0;
    if (!this.hasPlanData) {
      this.timelineMonths = [];
      this.timelineTasks = [];
      this.timelineDowntimes = [];
      this.productRows = [];
      return;
    }

    // 3) Преобразуем в структуры отображения
    this.processTimelineTasks(filteredTasks);
    this.processTimelineDowntimes(filteredDowntimes as any[]);
    this.extractProductRows();

    // 4) Месяцы: берём пересечение [минимальный месяц задач .. максимальный месяц задач] с выбранным диапазоном
    this.generateTimelineMonthsFromTasks(filteredTasks, range);
  }

  /** Создание массива месяцев по реальным задачам, обрезанного выбранным диапазоном */
  private generateTimelineMonthsFromTasks(tasks: any[], range?: { start: Date; end: Date }): void {
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const shortMonthNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

    const starts = tasks.map(t => this.parseDate(t.start_dt)).filter(d => !isNaN(d.getTime()));
    const ends   = tasks.map(t => this.parseDate(t.end_dt)).filter(d => !isNaN(d.getTime()));
    if (!starts.length || !ends.length) { this.timelineMonths = []; return; }

    // Границы по задачам
    const minStart = new Date(Math.min(...starts.map(d => d.getTime())));
    const maxEnd   = new Date(Math.max(...ends.map(d => d.getTime())));

    // Выравниваем к границам месяцев
    const tasksFrom = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
    const tasksTo   = new Date(maxEnd.getFullYear(), maxEnd.getMonth(), this.daysInMonth(maxEnd.getFullYear(), maxEnd.getMonth()));

    // Пересечение с выбранным диапазоном (если задан)
    let from = tasksFrom;
    let to   = tasksTo;
    if (range) {
      const selFrom = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
      const selTo   = new Date(range.end.getFullYear(),   range.end.getMonth(),   this.daysInMonth(range.end.getFullYear(), range.end.getMonth()));
      if (selFrom.getTime() > from.getTime()) from = selFrom;
      if (selTo.getTime()   < to.getTime())   to   = selTo;
    }

    if (from.getTime() > to.getTime()) { this.timelineMonths = []; return; }

    const months: TimelineMonth[] = [];
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
      const mStart = (y === from.getFullYear()) ? from.getMonth() + 1 : 1;
      const mEnd   = (y === to.getFullYear())   ? to.getMonth() + 1   : 12;
      for (let m = mStart; m <= mEnd; m++) {
        months.push({
          month: m,
          year: y,
          name: monthNames[m - 1],
          shortName: shortMonthNames[m - 1]
        });
      }
    }
    this.timelineMonths = months;
  }

  /** Строки = уникальная пара (line, product) среди уже отфильтрованных задач */
  private extractProductRows(): void {
    const set = new Set<string>();
    this.timelineTasks.forEach(t => set.add(`${t.line}__${t.product}`));
    this.productRows = Array.from(set).sort().map(k => {
      const [line, product] = k.split('__');
      return { line, product, key: k };
    });
  }

  private processTimelineTasks(tasks: any[]): void {
    this.timelineTasks = tasks.map(raw => {
      const task: any = this.normalizeTask(raw);
      const startDate = this.parseDate(task.start_dt);
      const endDate   = this.parseDate(task.end_dt);

      return {
        id: task.id,
        title: task.title,
        startMonth: startDate.getMonth() + 1,
        endMonth: endDate.getMonth() + 1,
        startYear: startDate.getFullYear(),
        endYear: endDate.getFullYear(),
        color: this.getTaskColor(startDate.getMonth() + 1),
        product: task.product?.name || 'Не указан',
        line: task.line?.name || 'Неизвестна'
      } as TimelineTask;
    });
  }

  private processTimelineDowntimes(downtimes: any[]): void {
    this.timelineDowntimes = downtimes.map((d: any) => {
      const startDate = this.parseDate(d.start_dt);
      const endDate   = this.parseDate(d.end_dt);

      return {
        id: d.id,
        startMonth: startDate.getMonth() + 1,
        endMonth: endDate.getMonth() + 1,
        startYear: startDate.getFullYear(),
        endYear: endDate.getFullYear(),
        kind: d.kind || 'Простой',
        status: d.status || 'Не указан',
        line: d.line?.name || 'Неизвестна'
      } as TimelineDowntime;
    });
  }

  // ===== Утилиты и нормализация =====

  // Нормализация: сервер может вернуть production_line, а компонент ожидает line
  private normalizeTask(t: any) {
    const line = t.line ?? t.production_line ?? null;
    const product = t.product ?? null;
    return { ...t, line, product };
  }

  private getTaskColor(startMonth: number): string {
    if (startMonth <= 4) return this.TASK_COLORS[0];
    if (startMonth <= 7) return this.TASK_COLORS[1];
    return this.TASK_COLORS[2];
  }

  private parseDate(dateStr: string): Date {
    if (!dateStr) return new Date(NaN);
    // DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const [dd, mm, yyyy] = dateStr.split('-').map(Number);
      return new Date(yyyy, mm - 1, dd);
    }
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [yyyy, mm, dd] = dateStr.split('-').map(Number);
      return new Date(yyyy, mm - 1, dd);
    }
    // DD.MM.YYYY
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
      const [dd, mm, yyyy] = dateStr.split('.').map(Number);
      return new Date(yyyy, mm - 1, dd);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(NaN) : d;
  }

  private toInputDate(d?: Date): string | null {
    if (!d) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`; // для <input type="date">
  }

  private fromInputDate(s?: string | null): Date | null {
    if (!s) return null;
    const [yyyy, mm, dd] = s.split('-').map(Number);
    return new Date(yyyy, (mm ?? 1) - 1, dd ?? 1);
  }

  private formatDDMMYYYY(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  /** Пересечение задачи с диапазоном (включительно) */
  private isTaskInRange(task: any, range?: { start: Date; end: Date } | undefined): boolean {
    if (!range) return true;
    const s = this.parseDate(task.start_dt);
    const e = this.parseDate(task.end_dt);
    return s <= range.end && e >= range.start;
  }

  /** Пересечение простоя с диапазоном (включительно) */
  private isDowntimeInRange(d: any, range?: { start: Date; end: Date } | undefined): boolean {
    if (!range) return true;
    const s = this.parseDate(d.start_dt);
    const e = this.parseDate(d.end_dt);
    return s <= range.end && e >= range.start;
  }

  private daysInMonth(year: number, month0: number): number {
    return new Date(year, month0 + 1, 0).getDate();
  }

  // ===== Хелперы для шаблона =====

  /** Задачи конкретной строки (пара line+product) */
  getTasksForRow(row: ProductRow): TimelineTask[] {
    return this.timelineTasks.filter(t => t.line === row.line && t.product === row.product);
  }

  /** Простой относится к линии — один и тот же для всех ее продуктов */
  getDowntimesForLine(lineName: string): TimelineDowntime[] {
    return this.timelineDowntimes.filter(d => d.line === lineName);
  }

  getTaskClassForMonth(task: TimelineTask, month: TimelineMonth) {
    const isActive = this.isTaskActiveInMonth(task, month);
    const hasConflict = this.hasConflictInMonth(task, month);
    return { 'task-active': isActive, 'task-conflict': hasConflict };
  }

  getTaskStyleForMonth(task: TimelineTask, month: TimelineMonth) {
    const isActive = this.isTaskActiveInMonth(task, month);
    return { 'background-color': isActive ? task.color : 'transparent' };
  }

  getDowntimeClassForMonth(downtime: TimelineDowntime, month: TimelineMonth) {
    return { 'downtime-active': this.isDowntimeActiveInMonth(downtime, month) };
  }

  private isTaskActiveInMonth(task: TimelineTask, month: TimelineMonth): boolean {
    if (task.startYear === task.endYear) {
      return month.year === task.startYear &&
             month.month >= task.startMonth &&
             month.month <= task.endMonth;
    } else {
      if (month.year === task.startYear) return month.month >= task.startMonth;
      if (month.year === task.endYear)   return month.month <= task.endMonth;
      return month.year > task.startYear && month.year < task.endYear;
    }
  }

  private isDowntimeActiveInMonth(d: TimelineDowntime, month: TimelineMonth): boolean {
    if (d.startYear === d.endYear) {
      return month.year === d.startYear &&
             month.month >= d.startMonth &&
             month.month <= d.endMonth;
    } else {
      if (month.year === d.startYear) return month.month >= d.startMonth;
      if (month.year === d.endYear)   return month.month <= d.endMonth;
      return month.year > d.startYear && month.year < d.endYear;
    }
  }

  private hasConflictInMonth(task: TimelineTask, month: TimelineMonth): boolean {
    return this.timelineDowntimes.some(d =>
      d.line === task.line &&
      this.isDowntimeActiveInMonth(d, month) &&
      this.isTaskActiveInMonth(task, month)
    );
  }
}
