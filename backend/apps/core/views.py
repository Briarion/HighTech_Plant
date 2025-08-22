"""
Основные представления API
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db import connection
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


@api_view(['GET'])
def health_check(request):
    """
    Проверка состояния сервиса
    """
    health_status = {
        'status': 'healthy',
        'version': '1.0.0',
        'timestamp': request.META.get('HTTP_DATE'),
        'checks': {}
    }
    
    # Проверка базы данных
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            health_status['checks']['database'] = 'healthy'
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status['checks']['database'] = 'unhealthy'
        health_status['status'] = 'unhealthy'
    
    # Проверка конфигурации LLM
    try:
        llm_config = settings.LLM_CONFIG
        if llm_config.get('base_url'):
            health_status['checks']['llm_config'] = 'configured'
        else:
            health_status['checks']['llm_config'] = 'not_configured'
    except Exception as e:
        logger.error(f"LLM config check failed: {e}")
        health_status['checks']['llm_config'] = 'error'
    
    # Возвращаем статус
    response_status = status.HTTP_200_OK if health_status['status'] == 'healthy' else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return Response({
        'success': True,
        'data': health_status,
        'error': None
    }, status=response_status)


@api_view(['GET'])
def health_live(request):
    """
    Проверка живости процесса - всегда возвращает 200 OK
    """
    return Response({
        'success': True,
        'data': {
            'status': 'alive',
            'timestamp': request.META.get('HTTP_DATE')
        },
        'error': None
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def health_ready(request):
    """
    Проверка готовности сервиса - проверяет БД и доступность LLM
    """
    is_ready = True
    checks = {}
    
    # Быстрая проверка БД
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks['database'] = 'ready'
    except Exception as e:
        logger.error(f"Database readiness check failed: {e}")
        checks['database'] = 'not_ready'
        is_ready = False
    
    # Быстрая проверка доступности LLM (опционально)
    try:
        import requests
        from django.conf import settings
        
        llm_config = getattr(settings, 'LLM_CONFIG', {})
        base_url = llm_config.get('base_url')
        
        if base_url:
            # Отправляем быстрый HEAD запрос с таймаутом 2 секунды
            response = requests.head(base_url, timeout=2)
            if response.status_code < 400:
                checks['llm'] = 'ready'
            else:
                checks['llm'] = 'not_ready'
                # LLM не готов, но это не критично для основного функционала
        else:
            checks['llm'] = 'not_configured'
            
    except requests.RequestException:
        checks['llm'] = 'not_ready'
        # LLM недоступен, но это не критично
    except Exception as e:
        logger.error(f"LLM readiness check failed: {e}")
        checks['llm'] = 'error'
    
    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return Response({
        'success': True,
        'data': {
            'status': 'ready' if is_ready else 'not_ready',
            'checks': checks,
            'timestamp': request.META.get('HTTP_DATE')
        },
        'error': None
    }, status=status_code)