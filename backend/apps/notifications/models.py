"""
Модели для системы уведомлений и конфликтов
"""
from django.db import models
import hashlib
import json


class Notification(models.Model):
    """Уведомления о событиях в системе"""
    
    LEVEL_CHOICES = [
        ('info', 'Информация'),
        ('warning', 'Предупреждение'), 
        ('error', 'Ошибка'),
        ('success', 'Успех'),
    ]
    
    CODE_CHOICES = [
        ('VALIDATION_ERROR', 'Ошибка валидации'),
        ('NOT_FOUND', 'Ресурс не найден'),
        ('UNSUPPORTED_MEDIA_TYPE', 'Неподдерживаемый тип файла'),
        ('PAYLOAD_TOO_LARGE', 'Файл слишком большой'),
        ('LLM_TIMEOUT', 'Таймаут LLM'),
        ('LLM_BAD_JSON', 'Некорректный JSON от LLM'),
        ('LLM_UNAVAILABLE', 'LLM недоступен'),
        ('ALIAS_UNKNOWN', 'Неизвестный псевдоним линии'),
        ('PLAN_DATE_COERCED', 'Дата скорректирована'),
        ('MINUTES_DUPLICATE_FILE', 'Дубликат файла'),
        ('CONFLICT_DETECTED', 'Обнаружен конфликт'),
        ('EXPORT_EMPTY', 'Нет данных для экспорта'),
    ]
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата создания"
    )
    level = models.CharField(
        max_length=20,
        choices=LEVEL_CHOICES,
        verbose_name="Уровень важности"
    )
    code = models.CharField(
        max_length=50,
        choices=CODE_CHOICES,
        verbose_name="Код уведомления"
    )
    text = models.TextField(
        verbose_name="Текст уведомления",
        help_text="Описание события на русском языке"
    )
    payload_json = models.JSONField(
        default=dict,
        verbose_name="Данные уведомления",
        help_text="Дополнительные данные о событии"
    )
    unique_key = models.CharField(
        max_length=64,
        unique=True,
        verbose_name="Уникальный ключ",
        help_text="SHA256 хеш для предотвращения дубликатов"
    )
    
    class Meta:
        db_table = 'notifications'
        verbose_name = 'Уведомление'
        verbose_name_plural = 'Уведомления'
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['level']),
            models.Index(fields=['code']),
            models.Index(fields=['unique_key']),
        ]
        ordering = ['-created_at']
    
    def save(self, *args, **kwargs):
        """Генерируем unique_key если не задан"""
        if not self.unique_key:
            # Создаём хеш на основе основных полей
            content = f"{self.code}:{self.text}:{json.dumps(self.payload_json, sort_keys=True)}"
            self.unique_key = hashlib.sha256(content.encode()).hexdigest()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"[{self.level.upper()}] {self.code}: {self.text[:100]}"


class FileDigest(models.Model):
    """Дайджесты обработанных файлов для предотвращения дубликатов"""
    
    KIND_CHOICES = [
        ('excel', 'Excel файл'),
        ('docx', 'Word документ'),
        ('other', 'Другой тип'),
    ]
    
    path = models.CharField(
        max_length=500,
        verbose_name="Путь к файлу"
    )
    sha256 = models.CharField(
        max_length=64,
        unique=True,
        verbose_name="SHA256 хеш",
        help_text="SHA256 хеш содержимого файла"
    )
    kind = models.CharField(
        max_length=20,
        choices=KIND_CHOICES,
        verbose_name="Тип файла"
    )
    file_size = models.BigIntegerField(
        verbose_name="Размер файла",
        help_text="Размер файла в байтах"
    )
    processed_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата обработки"
    )
    processing_result = models.JSONField(
        default=dict,
        verbose_name="Результат обработки",
        help_text="Структурированный результат обработки файла"
    )
    
    class Meta:
        db_table = 'file_digests'
        verbose_name = 'Дайджест файла'
        verbose_name_plural = 'Дайджесты файлов'
        indexes = [
            models.Index(fields=['sha256']),
            models.Index(fields=['-processed_at']),
            models.Index(fields=['kind']),
            models.Index(fields=['path']),
        ]
        ordering = ['-processed_at']
    
    def __str__(self):
        return f"{self.path} ({self.sha256[:8]}...)"