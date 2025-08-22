"""
Сериализаторы для системы уведомлений
"""
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """Сериализатор для уведомлений"""
    
    created_at = serializers.DateTimeField(format='%d-%m-%Y %H:%M:%S', read_only=True)
    
    class Meta:
        model = Notification
        fields = [
            'id',
            'created_at', 
            'level',
            'code',
            'text',
            'payload_json',
            'unique_key'
        ]
        read_only_fields = ['id', 'created_at', 'unique_key']
    
    def to_representation(self, instance):
        """Кастомное представление для API"""
        data = super().to_representation(instance)
        
        # Переименовываем payload_json в payload для удобства
        data['payload'] = data.pop('payload_json', {})
        
        return data