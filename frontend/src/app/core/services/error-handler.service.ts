import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  constructor(private toastr: ToastrService) {}

  handleError(error: any): void {
    console.error('Application error:', error);

    let title = 'Ошибка';
    let message = 'Произошла неожиданная ошибка';

    if (error instanceof HttpErrorResponse) {
      // HTTP ошибки
      title = this.getHttpErrorTitle(error.status);
      message = this.getHttpErrorMessage(error);
    } else if (error?.error) {
      // Ошибки API
      message = error.error.message || 'Ошибка API';
    } else if (error?.message) {
      // Обычные ошибки JavaScript
      message = error.message;
    }

    this.toastr.error(message, title, {
      timeOut: 7000,
      closeButton: true,
      progressBar: true
    });
  }

  handleSuccess(message: string, title: string = 'Успешно'): void {
    this.toastr.success(message, title, {
      timeOut: 4000,
      closeButton: true,
      progressBar: true
    });
  }

  handleWarning(message: string, title: string = 'Предупреждение'): void {
    this.toastr.warning(message, title, {
      timeOut: 5000,
      closeButton: true,
      progressBar: true
    });
  }

  handleInfo(message: string, title: string = 'Информация'): void {
    this.toastr.info(message, title, {
      timeOut: 4000,
      closeButton: true
    });
  }

  private getHttpErrorTitle(status: number): string {
    const statusTitles: { [key: number]: string } = {
      400: 'Неверный запрос',
      401: 'Не авторизован',
      403: 'Доступ запрещён',
      404: 'Не найдено',
      413: 'Слишком большой файл',
      415: 'Неподдерживаемый формат',
      422: 'Ошибка валидации',
      500: 'Ошибка сервера',
      502: 'Сервис недоступен',
      503: 'Сервис недоступен',
      504: 'Превышено время ожидания'
    };

    return statusTitles[status] || `Ошибка ${status}`;
  }

  private getHttpErrorMessage(error: HttpErrorResponse): string {
    // Пытаемся извлечь сообщение из API ответа
    if (error.error?.error?.message) {
      return error.error.error.message;
    }

    // Стандартные сообщения для HTTP статусов
    const statusMessages: { [key: number]: string } = {
      400: 'Проверьте правильность введённых данных',
      401: 'Необходимо войти в систему',
      403: 'У вас нет прав для выполнения этого действия',
      404: 'Запрашиваемый ресурс не найден',
      413: 'Размер файла превышает допустимый лимит (20 МБ)',
      415: 'Неподдерживаемый тип файла. Поддерживаются: .xlsx, .docx',
      422: 'Данные не прошли валидацию',
      500: 'Внутренняя ошибка сервера',
      502: 'LLM недоступен, используется резервный парсер',
      503: 'Сервис временно недоступен',
      504: 'Превышено время ожидания ответа от сервера'
    };

    return statusMessages[error.status] || 
           `Произошла ошибка при обращении к серверу (${error.status})`;
  }
}