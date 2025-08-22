import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Components
import { MainLayoutComponent } from './components/layout/main-layout/main-layout.component';
import { HeaderComponent } from './components/layout/header/header.component';
import { SidebarComponent } from './components/layout/sidebar/sidebar.component';
import { LoadingSpinnerComponent } from './components/ui/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent } from './components/ui/confirm-dialog/confirm-dialog.component';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [
    MainLayoutComponent,
    HeaderComponent,
    SidebarComponent,
    LoadingSpinnerComponent,
    ConfirmDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    HttpClientModule
  ],
  exports: [
    // Modules
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    
    // Components
    MainLayoutComponent,
    HeaderComponent,
    SidebarComponent,
    LoadingSpinnerComponent,
    ConfirmDialogComponent,
    HttpClientModule
  ]
})
export class SharedModule {}