"""
API views для системы уведомлений
"""
import json
import logging
import time
from django.http import StreamingHttpResponse
from django.db import connection, close_old_connections
from rest_framework.decorators import api_view, renderer_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import Notification
from .serializers import NotificationSerializer
from .renderers import EventStreamRenderer

logger = logging.getLogger(__name__)


def _format_sse_message(event_type: str, data: dict, event_id: str = None) -> str:
    """
    Форматирование SSE сообщения
    """
    message = ""
    if event_id:
        message += f"id: {event_id}\n"
    message += f"event: {event_type}\n"
    message += f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    return message


def _sse_notification_stream(since_id: int = None):
    """
    Генератор SSE потока для уведомлений
    """
    yield ": sse connected\n\n"
    last_id = since_id or 0
    heartbeat_counter = 0
    
    logger.info(f"SSE stream started with since_id={since_id}")
    
    try:
        while True:
            # Проверяем новые уведомления
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id, created_at, level, code, text, payload_json 
                        FROM notifications 
                        WHERE id > %s 
                        ORDER BY id ASC 
                        LIMIT 100
                        """,
                        [last_id]
                    )
                    rows = cursor.fetchall()
                
                # Отправляем новые уведомления
                for row in rows:
                    notification_id, created_at, level, code, text, payload_json = row
                    
                    notification_data = {
                        'id': notification_id,
                        'created_at': created_at.isoformat() if created_at else None,
                        'level': level,
                        'code': code,
                        'text': text,
                        'payload': payload_json or {}
                    }
                    
                    yield _format_sse_message('notification', notification_data, str(notification_id))
                    last_id = max(last_id, notification_id)
                
                # Отправляем heartbeat каждые 15 секунд (7-8 итераций по 2 секунды)
                heartbeat_counter += 1
                if heartbeat_counter % 8 == 0:
                    yield ": keepalive\n\n"
                    heartbeat_counter = 0
                
                time.sleep(2)  # Опрос каждые 2 секунды
                
            except Exception as e:
                logger.error(f"SSE stream error: {str(e)}", exc_info=True)
                # Отправляем ошибку клиенту
                error_data = {
                    'error': 'Ошибка получения уведомлений',
                    'details': str(e)
                }
                yield _format_sse_message('error', error_data)
                time.sleep(5)  # Больше пауза при ошибке
                
    except GeneratorExit:
        logger.info("SSE stream closed by client")
    except Exception as e:
        logger.error(f"SSE stream fatal error: {str(e)}", exc_info=True)


@api_view(['GET'])
@renderer_classes([EventStreamRenderer, JSONRenderer])
def notification_stream(request):
    """
    Server-Sent Events поток для получения уведомлений в реальном времени
    
    Параметры:
    - since_id: ID последнего полученного уведомления (опционально)
    """
    try:
        since_id = request.GET.get('since_id')
        if since_id:
            since_id = int(since_id)
        else:
            since_id = 0
            
        logger.info(f"Starting SSE stream for notifications since_id={since_id}")
        
        response = StreamingHttpResponse(
            _sse_notification_stream(since_id),
            content_type='text/event-stream; charset=utf-8',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'  # пусть прокси не буферизует
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Headers'] = 'Cache-Control'
        
        return response
        
    except ValueError as e:
        return Response({
            'success': False,
            'error': {
                'code': 'VALIDATION_ERROR',
                'message': 'Неверный формат since_id',
                'details': {'error': str(e)}
            }
        }, status=status.HTTP_400_BAD_REQUEST)
    
    except Exception as e:
        logger.error(f"SSE stream initialization failed: {str(e)}", exc_info=True)
        return Response({
            'success': False,
            'error': {
                'code': 'GENERAL_ERROR',
                'message': 'Не удалось запустить поток уведомлений',
                'details': {'error': str(e)}
            }
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def list_notifications(request):
    """
    Получение списка уведомлений с пагинацией
    
    Параметры:
    - limit: количество записей (по умолчанию 50)
    - offset: смещение (по умолчанию 0)
    - level: фильтр по уровню важности
    - code: фильтр по коду уведомления
    """
    try:
        limit = int(request.GET.get('limit', 50))
        offset = int(request.GET.get('offset', 0))
        level = request.GET.get('level')
        code = request.GET.get('code')
        
        # Ограничиваем лимит
        limit = min(limit, 200)
        
        # Базовый запрос
        queryset = Notification.objects.all()
        
        # Фильтрация
        if level:
            queryset = queryset.filter(level=level)
        if code:
            queryset = queryset.filter(code=code)
        
        # Пагинация
        total_count = queryset.count()
        notifications = queryset[offset:offset + limit]
        
        # Сериализация
        serializer = NotificationSerializer(notifications, many=True)
        
        return Response({
            'success': True,
            'data': {
                'notifications': serializer.data,
                'total_count': total_count,
                'limit': limit,
                'offset': offset,
                'has_next': offset + limit < total_count
            },
            'error': None
        }, status=status.HTTP_200_OK)
        
    except ValueError as e:
        return Response({
            'success': False,
            'error': {
                'code': 'VALIDATION_ERROR',
                'message': 'Неверные параметры запроса',
                'details': {'error': str(e)}
            }
        }, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        logger.error(f"Notifications list failed: {str(e)}", exc_info=True)
        return Response({
            'success': False,
            'error': {
                'code': 'GENERAL_ERROR',
                'message': 'Не удалось получить список уведомлений',
                'details': {'error': str(e)}
            }
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def create_notification(request):
    """
    Создание нового уведомления (для внутреннего использования)
    """
    try:
        serializer = NotificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': {
                    'code': 'VALIDATION_ERROR',
                    'message': 'Ошибка валидации данных уведомления',
                    'details': serializer.errors
                }
            }, status=status.HTTP_400_BAD_REQUEST)
        
        notification = serializer.save()
        
        logger.info(f"Notification created: {notification.code} - {notification.text[:100]}")
        
        return Response({
            'success': True,
            'data': NotificationSerializer(notification).data,
            'error': None
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.error(f"Notification creation failed: {str(e)}", exc_info=True)
        return Response({
            'success': False,
            'error': {
                'code': 'GENERAL_ERROR',
                'message': 'Не удалось создать уведомление',
                'details': {'error': str(e)}
            }
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)