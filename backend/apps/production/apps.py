from django.apps import AppConfig


class ProductionConfig(AppConfig):
    """Конфигурация приложения производства"""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.production'
    verbose_name = 'Управление производством'