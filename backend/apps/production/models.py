"""
Модели для управления производственными данными
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class ProductionLine(models.Model):
    """Производственная линия"""
    
    name = models.CharField(
        max_length=200,
        unique=True,
        verbose_name="Название линии",
        help_text="Каноническое название линии (например, 'Линия_66')"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание",
        help_text="Дополнительное описание линии"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна",
        help_text="Активна ли линия в данный момент"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")
    
    class Meta:
        db_table = 'production_lines'
        verbose_name = 'Производственная линия'
        verbose_name_plural = 'Производственные линии'
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['is_active']),
            models.Index(fields=['-created_at']),
        ]
    
    def __str__(self):
        return self.name


class LineAlias(models.Model):
    """Псевдонимы линий для распознавания в документах"""
    
    production_line = models.ForeignKey(
        ProductionLine,
        on_delete=models.CASCADE,
        related_name='aliases',
        verbose_name="Производственная линия"
    )
    alias = models.CharField(
        max_length=100,
        verbose_name="Псевдоним",
        help_text="Альтернативное название линии в документах"
    )
    confidence_weight = models.FloatField(
        default=1.0,
        validators=[MinValueValidator(0.0), MaxValueValidator(2.0)],
        verbose_name="Вес доверия",
        help_text="Вес для алгоритма сопоставления (0.0 - 2.0)"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    
    class Meta:
        db_table = 'line_aliases'
        verbose_name = 'Псевдоним линии'
        verbose_name_plural = 'Псевдонимы линий'
        unique_together = [['production_line', 'alias']]
        indexes = [
            models.Index(fields=['alias']),
            models.Index(fields=['production_line', 'alias']),
        ]
    
    def __str__(self):
        return f"{self.production_line.name} -> {self.alias}"


class Product(models.Model):
    """Продукт/изделие"""
    
    name = models.CharField(
        max_length=200,
        verbose_name="Наименование продукта"
    )
    code = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        verbose_name="Код продукта",
        help_text="Уникальный код продукта (может генерироваться автоматически)"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание продукта"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")
    
    class Meta:
        db_table = 'products'
        verbose_name = 'Продукт'
        verbose_name_plural = 'Продукты'
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['name']),
        ]
    
    def save(self, *args, **kwargs):
        """Генерируем код продукта, если он не задан"""
        if not self.code:
            # Генерируем код на основе названия
            base_code = self.name[:20].upper().replace(' ', '_')
            counter = 1
            while Product.objects.filter(code=f"{base_code}_{counter:03d}").exists():
                counter += 1
            self.code = f"{base_code}_{counter:03d}"
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.name} ({self.code})"


class PlanTask(models.Model):
    """Задача плана производства"""
    
    production_line = models.ForeignKey(
        ProductionLine,
        on_delete=models.CASCADE,
        related_name='plan_tasks',
        verbose_name="Производственная линия"
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='plan_tasks',
        verbose_name="Продукт"
    )
    title = models.CharField(
        max_length=300,
        verbose_name="Название задачи",
        help_text="Описание производственной задачи"
    )
    start_dt = models.DateField(
        verbose_name="Дата начала",
        help_text="Плановая дата начала выполнения"
    )
    end_dt = models.DateField(
        verbose_name="Дата окончания",
        help_text="Плановая дата окончания выполнения"
    )
    source = models.CharField(
        max_length=20,
        default='excel',
        choices=[
            ('excel', 'Excel файл'),
            ('manual', 'Ручной ввод'),
            ('api', 'API'),
        ],
        verbose_name="Источник данных"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")
    
    class Meta:
        db_table = 'plan_tasks'
        verbose_name = 'Задача плана'
        verbose_name_plural = 'Задачи плана'
        indexes = [
            models.Index(fields=['production_line', 'start_dt']),
            models.Index(fields=['start_dt', 'end_dt']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['source']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(start_dt__lte=models.F('end_dt')),
                name='plan_task_valid_date_range'
            )
        ]
    
    @property
    def duration_days(self):
        """Длительность задачи в днях"""
        return (self.end_dt - self.start_dt).days + 1
    
    def __str__(self):
        return f"{self.title} ({self.start_dt} - {self.end_dt})"


class Downtime(models.Model):
    """Простой производственной линии"""
    
    STATUS_CHOICES = [
        ('утверждено', 'Утверждено'),
        ('план', 'План'),
        ('предложение', 'Предложение'),
        ('обсуждение', 'Обсуждение'),
        ('выполнено', 'Выполнено'),
    ]
    
    KIND_CHOICES = [
        ('обслуживание', 'Обслуживание'),
        ('ремонт', 'Ремонт'),
        ('модернизация', 'Модернизация'),
        ('прочее', 'Прочее'),
    ]
    
    SOURCE_CHOICES = [
        ('llm', 'LLM извлечение'),
        ('fallback', 'Резервный парсер'),
        ('manual', 'Ручной ввод'),
    ]
    
    line = models.ForeignKey(
        ProductionLine,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='downtimes',
        verbose_name="Производственная линия",
        help_text="Может быть NULL для неопределённых линий"
    )
    start_dt = models.DateField(verbose_name="Дата начала простоя")
    end_dt = models.DateField(verbose_name="Дата окончания простоя")
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        null=True,
        blank=True,
        verbose_name="Статус",
        help_text="Статус простоя согласно приоритету"
    )
    kind = models.CharField(
        max_length=20,
        choices=KIND_CHOICES,
        null=True,
        blank=True,
        verbose_name="Вид работ"
    )
    
    source_file = models.CharField(
        max_length=500,
        blank=True,
        verbose_name="Исходный файл",
        help_text="Путь к файлу, из которого извлечён простой"
    )
    evidence_quote = models.TextField(
        blank=True,
        verbose_name="Цитата из документа",
        help_text="Текст из документа, подтверждающий простой"
    )
    evidence_location = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Местоположение в документе",
        help_text="Указание на место в документе (страница, параграф)"
    )
    
    confidence = models.FloatField(
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        verbose_name="Уверенность извлечения",
        help_text="Уровень уверенности LLM/парсера (0.0 - 1.0)"
    )
    partial_date_start = models.BooleanField(
        default=False,
        verbose_name="Частичная дата начала",
        help_text="Год был восстановлен эвристически"
    )
    partial_date_end = models.BooleanField(
        default=False,
        verbose_name="Частичная дата окончания",
        help_text="Год был восстановлен эвристически"
    )
    
    notes = models.TextField(
        blank=True,
        verbose_name="Заметки",
        help_text="Дополнительные заметки о процессе извлечения"
    )
    extraction_version = models.CharField(
        max_length=10,
        default='v1',
        verbose_name="Версия извлечения"
    )
    source_hash = models.CharField(
        max_length=64,
        verbose_name="Хеш источника",
        help_text="SHA256 хеш исходного текстового окна"
    )
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        verbose_name="Источник извлечения"
    )
    sources_json = models.JSONField(
        default=list,
        verbose_name="Источники JSON",
        help_text="Список источников при слиянии записей"
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")
    
    class Meta:
        db_table = 'downtimes'
        verbose_name = 'Простой линии'
        verbose_name_plural = 'Простои линий'
        indexes = [
            models.Index(fields=['line', 'start_dt', 'end_dt']),
            models.Index(fields=['start_dt', 'end_dt']),
            models.Index(fields=['source']),
            models.Index(fields=['source_hash']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['confidence']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(start_dt__lte=models.F('end_dt')),
                name='downtime_valid_date_range'
            )
        ]
    
    @property
    def duration_days(self):
        """Длительность простоя в днях"""
        return (self.end_dt - self.start_dt).days + 1
    
    @property
    def status_priority(self):
        """Числовой приоритет статуса (для сравнения)"""
        priorities = {
            'утверждено': 5,
            'выполнено': 4,
            'план': 3,
            'предложение': 2,
            'обсуждение': 1,
        }
        return priorities.get(self.status, 0)
    
    def __str__(self):
        line_name = self.line.name if self.line else 'Unknown'
        return f"{line_name} простой ({self.start_dt} - {self.end_dt})"