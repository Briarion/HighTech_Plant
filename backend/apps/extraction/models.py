"""
Модели для результатов сканирования директории с переписками и анализом через LLM
"""
import uuid
from django.db import models


class ScanJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        RUNNING = "running"
        COMPLETED = "completed"
        FAILED = "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING
    )
    progress = models.FloatField(null=True, blank=True)  # 0..100
    message = models.TextField(blank=True, default="")
    results = models.JSONField(null=True, blank=True, default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"ScanJob {self.id} [{self.status}]"
