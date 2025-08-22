"""
Сериализаторы для API производственных данных
"""
from rest_framework import serializers
from .models import ProductionLine, LineAlias, Product, PlanTask, Downtime


class ProductionLineSerializer(serializers.ModelSerializer):
    """Сериализатор производственной линии"""
    
    aliases = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductionLine
        fields = [
            'id', 'name', 'description', 'is_active', 
            'aliases', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_aliases(self, obj):
        """Получить список псевдонимов линии"""
        return [alias.alias for alias in obj.aliases.all()]


class ProductSerializer(serializers.ModelSerializer):
    """Сериализатор продукта"""
    
    class Meta:
        model = Product
        fields = ['id', 'name', 'code', 'description', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class PlanTaskSerializer(serializers.ModelSerializer):
    """Сериализатор задачи плана"""
    
    line = ProductionLineSerializer(source='production_line', read_only=True)
    product = ProductSerializer(read_only=True)
    
    # Для записи
    line_id = serializers.IntegerField(write_only=True, source='production_line_id')
    product_id = serializers.IntegerField(write_only=True)
    
    # Форматирование даты в DD-MM-YYYY
    start_dt = serializers.DateField(format='%d-%m-%Y', input_formats=['%d-%m-%Y'])
    end_dt = serializers.DateField(format='%d-%m-%Y', input_formats=['%d-%m-%Y'])
    
    class Meta:
        model = PlanTask
        fields = [
            'id', 'line', 'product', 'title', 
            'start_dt', 'end_dt', 'source',
            'line_id', 'product_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def validate(self, data):
        """Валидация данных задачи"""
        if data.get('start_dt') and data.get('end_dt'):
            if data['start_dt'] > data['end_dt']:
                raise serializers.ValidationError(
                    "Дата начала не может быть позже даты окончания"
                )
        return data


class DowntimeSerializer(serializers.ModelSerializer):
    """Сериализатор простоя"""
    
    line = ProductionLineSerializer(read_only=True)
    line_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    
    # Форматирование даты в DD-MM-YYYY
    start_dt = serializers.DateField(format='%d-%m-%Y', input_formats=['%d-%m-%Y'])
    end_dt = serializers.DateField(format='%d-%m-%Y', input_formats=['%d-%m-%Y'])
    
    class Meta:
        model = Downtime
        fields = [
            'id', 'line', 'line_id', 'start_dt', 'end_dt',
            'status', 'kind', 'source_file', 'evidence_quote',
            'evidence_location', 'confidence', 'partial_date_start',
            'partial_date_end', 'notes', 'extraction_version',
            'source_hash', 'source', 'sources_json',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def validate(self, data):
        """Валидация данных простоя"""
        if data.get('start_dt') and data.get('end_dt'):
            if data['start_dt'] > data['end_dt']:
                raise serializers.ValidationError(
                    "Дата начала не может быть позже даты окончания"
                )
        
        if data.get('confidence') is not None:
            if not (0.0 <= data['confidence'] <= 1.0):
                raise serializers.ValidationError(
                    "Уверенность должна быть в диапазоне от 0.0 до 1.0"
                )
        
        return data


class PlanUploadSerializer(serializers.Serializer):
    """Сериализатор для загрузки плана из Excel"""
    
    file = serializers.FileField()
    
    def validate_file(self, value):
        """Валидация загружаемого файла"""
        # Проверка расширения файла
        if not value.name.lower().endswith(('.xlsx', '.xls')):
            raise serializers.ValidationError(
                "Поддерживаются только файлы Excel (.xlsx, .xls)"
            )
        
        # Проверка размера файла (20 МБ)
        max_size = 20 * 1024 * 1024  # 20 MB
        if value.size > max_size:
            raise serializers.ValidationError(
                f"Размер файла не должен превышать 20 МБ. "
                f"Текущий размер: {value.size / 1024 / 1024:.1f} МБ"
            )
        
        return value
