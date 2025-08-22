import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

// Регистрируем русскую локаль
registerLocaleData(localeRu);

if (environment.production) {
  // Отключаем логи в production
  console.log = () => {};
  console.debug = () => {};
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));