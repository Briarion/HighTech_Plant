import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';

import { DowntimesListComponent } from './components/downtimes-list/downtimes-list.component';
import { DowntimesDetailComponent } from './components/downtimes-detail/downtimes-detail.component';
import { DowntimesScanComponent } from './components/downtimes-scan/downtimes-scan.component';

const routes: Routes = [
  {
    path: '',
    component: DowntimesListComponent
  },
  {
    path: 'scan',
    component: DowntimesScanComponent
  },
  {
    path: ':id',
    component: DowntimesDetailComponent
  }
];

@NgModule({
  declarations: [
    DowntimesListComponent,
    DowntimesDetailComponent,
    DowntimesScanComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes)
  ]
})
export class DowntimesModule {}