import { NgModule, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

// Toast notifications
import { ToastrModule } from 'ngx-toastr';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// Core modules
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';

// Interceptors
import { LoadingInterceptor } from './core/interceptors/loading.interceptor';
import { ErrorInterceptor } from './core/interceptors/error.interceptor';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    
    // Third party
    ToastrModule.forRoot({
      timeOut: 7000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
      closeButton: true,
      progressBar: true,
      enableHtml: true
    }),
    
    // Core and shared
    CoreModule.forRoot(),
    SharedModule
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ru-RU' },
    provideHttpClient(withInterceptorsFromDi()),

    // Регистрируем интерсепторы как multi-провайдеры
    // ПОРЯДОК ВАЖЕН: запрос проходит сверху вниз, ответ — снизу вверх
    { provide: HTTP_INTERCEPTORS, useClass: LoadingInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor,   multi: true },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }