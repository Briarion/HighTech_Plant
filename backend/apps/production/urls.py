"""
URL patterns для API производственных данных
"""
from django.urls import path
from . import views

app_name = 'production'

urlpatterns = [
    # Производственные линии
    path("lines/", views.ProductionLineListView.as_view(), name="line-list"),
    path(
        "lines/<int:pk>/", views.ProductionLineDetailView.as_view(), name="line-detail"
    ),
    # План производства
    path("plan/", views.PlanTaskListView.as_view(), name="plan-list"),
    path("plan/<int:pk>/", views.PlanTaskDetailView.as_view(), name="plan-detail"),
    path("plan/upload/", views.upload_plan, name="plan-upload"),
    # Простои
    path("downtimes/", views.DowntimeListView.as_view(), name="downtime-list"),
    path(
        "downtimes/<int:pk>/",
        views.DowntimeDetailView.as_view(),
        name="downtime-detail",
    ),
    # Конфликты
    path("conflicts/", views.get_conflicts, name="conflicts-list"),
    # Экспорт
    path(
        "export/conflicts.csv", views.export_conflicts_csv, name="export-conflicts-csv"
    ),
    path(
        "export/conflicts.json",
        views.export_conflicts_json,
        name="export-conflicts-json",
    ),
    path("export/plan.xlsx", views.export_plan_excel, name="export-plan-excel"),
    path("export/plan.csv", views.export_plan_csv, name="export-plan-csv"),

    # Сброс базы данных
    path("reset-db/", views.reset_database, name="reset-database"),
]