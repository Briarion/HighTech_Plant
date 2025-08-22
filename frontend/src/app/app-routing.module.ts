import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  {
    path: 'plan',
    loadChildren: () => import('./features/plan/plan.module').then(m => m.PlanModule)
  },
  {
    path: 'downtimes',
    loadChildren: () => import('./features/downtimes/downtimes.module').then(m => m.DowntimesModule)
  },
  {
    path: 'conflicts',
    loadChildren: () => import('./features/conflicts/conflicts.module').then(m => m.ConflictsModule)
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    enableTracing: false,
    preloadingStrategy: undefined
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }