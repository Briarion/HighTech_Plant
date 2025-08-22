import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';

import { PlanListComponent } from './components/plan-list/plan-list.component';
import { PlanDetailComponent } from './components/plan-detail/plan-detail.component';

const routes: Routes = [
  {
    path: '',
    component: PlanListComponent
  },
  {
    path: ':id',
    component: PlanDetailComponent
  }
];

@NgModule({
  declarations: [
    PlanListComponent,
    PlanDetailComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild(routes)
  ]
})
export class PlanModule {}