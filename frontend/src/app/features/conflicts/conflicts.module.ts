import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { FormsModule } from '@angular/forms';

import { ConflictsListComponent } from './components/conflicts-list/conflicts-list.component';
import { ConflictsDetailComponent } from './components/conflicts-detail/conflicts-detail.component';

const routes: Routes = [
  {
    path: '',
    component: ConflictsListComponent
  },
  {
    path: ':id',
    component: ConflictsDetailComponent
  }
];

@NgModule({
  declarations: [
    ConflictsListComponent,
    ConflictsDetailComponent
  ],
  imports: [
    FormsModule,
    SharedModule,
    RouterModule.forChild(routes)
  ]
})
export class ConflictsModule {}