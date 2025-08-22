from django.apps import AppConfig


class ExtractionConfig(AppConfig):
    """Конфигурация приложения для извлечения данных"""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.extraction'
    verbose_name = 'Извлечение данных'