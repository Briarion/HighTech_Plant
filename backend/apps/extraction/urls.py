"""
URL patterns для API извлечения данных
"""
from django.urls import path
from . import views

app_name = 'extraction'

urlpatterns = [
    # Асинхронное сканирование протоколов
    path("scan-jobs/start/", views.start_scan_job, name="scan-start"),
    path("scan-jobs/<uuid:job_id>/", views.get_scan_job, name="scan-detail"),
    path("scan-jobs/", views.list_scan_jobs, name="scan-list"),
]