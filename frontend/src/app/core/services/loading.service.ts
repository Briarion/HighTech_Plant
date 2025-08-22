import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private requestCount = 0;

  public loading$ = this.loadingSubject.asObservable();

  setLoading(loading: boolean): void {
    if (loading) {
      this.requestCount++;
    } else {
      this.requestCount--;
    }

    // Показываем индикатор загрузки только если есть активные запросы
    this.loadingSubject.next(this.requestCount > 0);
  }

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }
}