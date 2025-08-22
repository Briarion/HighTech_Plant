from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    """Конфигурация приложения для обработки документов"""
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.documents'
    verbose_name = 'Обработка документов'