import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { PlanService, UploadResponse } from '../../../../core/services/plan.service';

@Component({
  selector: 'app-plan-upload',
  templateUrl: './plan-upload.component.html',
  styleUrls: ['./plan-upload.component.scss'],
  standalone: false
})
export class PlanUploadComponent {
  @Output() uploadFinished = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  selectedFile: File | null = null;
  isUploading = false;
  result: any = null;
  error: any = null;

  constructor(private router: Router, private planService: PlanService) {}

  onHide(): void {
    this.closed.emit();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  onUpload(): void {
    if (!this.selectedFile) return;

    this.isUploading = true;
    this.result = null;
    this.error = null;

    this.planService.uploadPlan(this.selectedFile).subscribe(
      (res: UploadResponse) => {
        this.isUploading = false;
        if (res.success) {
          this.result = res.data;
        } else {
          this.error = res.error;
        }
      },
      (err: { error: { message: string } }) => {
        this.isUploading = false;
        this.error = err.error || { message: 'Неизвестная ошибка' };
      }
    );
  }
}