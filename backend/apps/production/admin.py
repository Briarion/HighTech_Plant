"""
Django admin для управления производственными данными
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import ProductionLine, LineAlias, Product, PlanTask, Downtime


class LineAliasInline(admin.TabularInline):
    """Inline редактор псевдонимов линий"""
    model = LineAlias
    extra = 1
    fields = ['alias', 'confidence_weight']


@admin.register(ProductionLine)
class ProductionLineAdmin(admin.ModelAdmin):
    """Администрирование производственных линий"""
    
    list_display = ['name', 'is_active', 'aliases_count', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'description', 'aliases__alias']
    ordering = ['name']
    inlines = [LineAliasInline]
    
    def aliases_count(self, obj):
        """Количество псевдонимов"""
        return obj.aliases.count()
    aliases_count.short_description = 'Псевдонимы'


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    """Администрирование продуктов"""
    
    list_display = ['name', 'code', 'created_at']
    search_fields = ['name', 'code', 'description']
    ordering = ['name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(PlanTask)
class PlanTaskAdmin(admin.ModelAdmin):
    """Администрирование задач плана"""
    
    list_display = [
        'title', 'production_line', 'product', 
        'start_dt', 'end_dt', 'duration_days', 'source'
    ]
    list_filter = ['source', 'production_line', 'start_dt', 'created_at']
    search_fields = ['title', 'production_line__name', 'product__name']
    ordering = ['start_dt', 'production_line__name']
    date_hierarchy = 'start_dt'
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('title', 'production_line', 'product')
        }),
        ('Временные рамки', {
            'fields': ('start_dt', 'end_dt')
        }),
        ('Метаданные', {
            'fields': ('source', 'created_at', 'updated_at'),
            'classes': ['collapse']
        }),
    )
    
    def duration_days(self, obj):
        """Длительность в днях"""
        return obj.duration_days
    duration_days.short_description = 'Дней'


@admin.register(Downtime)
class DowntimeAdmin(admin.ModelAdmin):
    """Администрирование простоев"""
    
    list_display = [
        'line_name', 'start_dt', 'end_dt', 'duration_days',
        'status', 'kind', 'confidence_badge', 'source'
    ]
    list_filter = [
        'source', 'status', 'kind', 'line', 
        'partial_date_start', 'partial_date_end',
        'start_dt', 'created_at'
    ]
    search_fields = [
        'line__name', 'evidence_quote', 'notes',
        'source_file'
    ]
    ordering = ['-confidence', 'start_dt']
    date_hierarchy = 'start_dt'
    readonly_fields = [
        'created_at', 'updated_at', 'source_hash', 'extraction_version'
    ]
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('line', 'start_dt', 'end_dt', 'status', 'kind')
        }),
        ('Источник данных', {
            'fields': (
                'source_file', 'evidence_quote', 'evidence_location',
                'source', 'confidence'
            )
        }),
        ('Дополнительно', {
            'fields': (
                'partial_date_start', 'partial_date_end', 'notes',
                'sources_json'
            ),
            'classes': ['collapse']
        }),
        ('Метаданные', {
            'fields': (
                'extraction_version', 'source_hash',
                'created_at', 'updated_at'
            ),
            'classes': ['collapse']
        }),
    )
    
    def line_name(self, obj):
        """Название линии"""
        return obj.line.name if obj.line else 'Unknown'
    line_name.short_description = 'Линия'
    
    def confidence_badge(self, obj):
        """Цветной бейдж уверенности"""
        if obj.confidence >= 0.8:
            color = 'green'
        elif obj.confidence >= 0.6:
            color = 'orange'
        else:
            color = 'red'
        
        return format_html(
            '<span style="color: {}; font-weight: bold;">{:.1%}</span>',
            color, obj.confidence
        )
    confidence_badge.short_description = 'Уверенность'
    
    def duration_days(self, obj):
        """Длительность в днях"""
        return obj.duration_days
    duration_days.short_description = 'Дней'


# Кастомизация заголовков админки
admin.site.site_header = 'Scheduler: Управление производством'
admin.site.site_title = 'Scheduler Admin'
admin.site.index_title = 'Планирование и контроль простоев'