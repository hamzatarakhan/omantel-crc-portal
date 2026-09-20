import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableCustomSelects } from './app/shared/select-menu';

enableCustomSelects();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
