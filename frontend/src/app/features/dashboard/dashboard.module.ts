import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';

import { DashboardComponent } from './components/dashboard/dashboard.component';
import { StatsCardComponent } from './components/stats-card/stats-card.component';
import { RecentActivitiesComponent } from './components/recent-activities/recent-activities.component';
import { SystemStatusComponent } from './components/system-status/system-status.component';
import { PlanTimelineComponent } from './components/plan-timeline/plan-timeline.component';
import { PlanUploadComponent } from './components/plan-upload/plan-upload.component';

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent
  }
];

@NgModule({
  declarations: [
    DashboardComponent,
    StatsCardComponent,
    RecentActivitiesComponent,
    SystemStatusComponent,
    PlanTimelineComponent,
    PlanUploadComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes)
  ]
})
export class DashboardModule {}