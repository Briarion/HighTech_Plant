"""
Кастомные исключения и обработчики ошибок для API
"""
from rest_framework.views import exception_handler
import logging

logger = logging.getLogger(__name__)

# Коды ошибок согласно требованиям
ERROR_CODES = {
    'VALIDATION_ERROR': 'Неверные данные запроса',
    'NOT_FOUND': 'Ресурс не найден',
    'UNSUPPORTED_MEDIA_TYPE': 'Неподдерживаемый тип файла',
    'PAYLOAD_TOO_LARGE': 'Файл превышает лимит 20 МБ',
    'LLM_TIMEOUT': 'Превышено время ожидания ответа LLM',
    'LLM_BAD_JSON': 'LLM вернул некорректный JSON; использован резервный парсер',
    'LLM_UNAVAILABLE': 'LLM недоступен; использован резервный парсер',
    'ALIAS_UNKNOWN': 'Не удалось сопоставить псевдоним линии (line=null)',
    'PLAN_DATE_COERCED': 'Невозможная дата была скорректирована (31.04 → 30.04)',
    'MINUTES_DUPLICATE_FILE': 'Дубликат файла протокола (sha256 уже обработан)',
    'CONFLICT_DETECTED': 'Обнаружено пересечение: простой × план_задача',
    'EXPORT_EMPTY': 'Нет данных для экспорта',
}


class SchedulerAPIException(Exception):
    """Базовое исключение для API планировщика"""
    default_message = "Произошла ошибка"
    default_code = "GENERAL_ERROR"
    status_code = 500
    
    def __init__(self, message: str = None, code: str = None, details: dict = None):
        self.message = message or self.default_message
        self.code = code or self.default_code
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(SchedulerAPIException):
    """Ошибка валидации данных"""
    default_message = "Неверные данные запроса"
    default_code = "VALIDATION_ERROR"
    status_code = 400


class FileProcessingError(SchedulerAPIException):
    """Ошибка обработки файла"""
    default_message = "Ошибка обработки файла"
    default_code = "FILE_PROCESSING_ERROR"
    status_code = 400


class LLMError(SchedulerAPIException):
    """Ошибка работы с LLM"""
    default_message = "Ошибка обработки документа с помощью LLM"
    default_code = "LLM_ERROR"
    status_code = 502


class LLMTimeoutError(LLMError):
    """Превышено время ожидания LLM"""
    default_message = "Превышено время ожидания ответа LLM"
    default_code = "LLM_TIMEOUT"
    status_code = 504


class LLMUnavailableError(LLMError):
    """LLM недоступен"""
    default_message = "LLM недоступен; использован резервный парсер"
    default_code = "LLM_UNAVAILABLE"
    status_code = 503


def custom_exception_handler(exc, context):
    """
    Кастомный обработчик исключений для единого формата ошибок API
    """
    # Вызываем стандартный обработчик DRF
    response = exception_handler(exc, context)
    
    # Логируем ошибку
    logger.error(f"API Exception: {exc}", exc_info=True, extra={
        'view': context.get('view'),
        'request': context.get('request'),
    })
    
    if response is not None:
        # Форматируем ответ в соответствии с требованиями
        error_code = "GENERAL_ERROR"
        error_message = "Произошла ошибка"
        error_details = {}
        
        if isinstance(exc, SchedulerAPIException):
            error_code = exc.code
            error_message = exc.message
            error_details = exc.details
        elif hasattr(exc, 'detail'):
            if isinstance(exc.detail, dict):
                error_message = str(exc.detail)
                error_details = exc.detail
            else:
                error_message = str(exc.detail)
        
        # Определяем код ошибки по статусу HTTP
        if response.status_code == 400:
            error_code = "VALIDATION_ERROR"
            if not error_message or error_message == "Произошла ошибка":
                error_message = ERROR_CODES['VALIDATION_ERROR']
        elif response.status_code == 404:
            error_code = "NOT_FOUND"
            error_message = ERROR_CODES['NOT_FOUND']
        elif response.status_code == 413:
            error_code = "PAYLOAD_TOO_LARGE"
            error_message = ERROR_CODES['PAYLOAD_TOO_LARGE']
        elif response.status_code == 415:
            error_code = "UNSUPPORTED_MEDIA_TYPE"
            error_message = ERROR_CODES['UNSUPPORTED_MEDIA_TYPE']
        
        custom_response_data = {
            'success': False,
            'data': None,
            'error': {
                'code': error_code,
                'message': error_message,
                'details': error_details
            }
        }
        
        response.data = custom_response_data
    
    return response