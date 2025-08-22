"""
URL patterns для API уведомлений
"""
from django.urls import path
from . import views

app_name = 'notifications'

urlpatterns = [
    # SSE поток уведомлений
    path('stream/', views.notification_stream, name='notification-stream'),
    
    # Список уведомлений
    path('', views.list_notifications, name='notification-list'),
    
    # Создание уведомления (для внутреннего использования)
    path('create/', views.create_notification, name='notification-create'),
]