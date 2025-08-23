# Scheduler with Protocol Parser MVP

Локальная система планирования с интеллектуальным парсером протоколов совещаний.

## Описание

- Стек и развёртывание: всё локально в Docker Compose — веб-UI (Angular+Nginx), сервер (Django+DRF), БД (PostgreSQL), кэш/буфер (Redis) и локальный LLM через LangChain на базе Qwen 2.5 (llama.cpp, OpenAI-совместимый API). Единый стандарт времени: Europe/Moscow, даты DD-MM-YYYY.

- Роль LLM: читает протоколы совещаний (.docx) и структурирует их в факты о простоях (какая линия, когда, причина, уверенность, цитата-доказательство). LangChain управляет подсказками, порциями текста и валидацией формата ответа.

- Нормализация данных: названия линий приводятся к единому справочнику (учёт синонимов/алиасов), даты унифицируются; шум и дубликаты отбрасываются, смежные интервалы склеиваются; есть порог уверенности и ретраи.

- Поиск конфликтов: система сравнивает интервалы производства из плана (Excel) с интервалами простоев из LLM; пересечения помечаются конфликтами, для них рассчитывается серьёзность по правилам (доля перекрытия, длительность, критичность линии).

- Управление и прозрачность: через UI видны прогресс обработки в реальном времени (SSE), список конфликтов и детальные карточки с обоснованием (цитаты из документов); всё работает офлайн, данные не покидают периметр.

### Ключевые возможности

- 📊 **Импорт планов из Excel** - автоматическое извлечение производственных задач
- 📥 **Экспорт планов в Excel/CSV** - выгрузка планов с фильтрацией по датам и линиям
- 🤖 **ИИ-парсинг протоколов** - интеллектуальное извлечение простоев из .docx документов
- ⚡ **Обнаружение конфликтов** - автоматическое выявление пересечений планов и простоев
- 📈 **Интерактивная визуализация** - Gantt-диаграмма с временной шкалой
- 🔄 **Асинхронная обработка** - фоновое сканирование больших объемов документов
- 🇷🇺 **Полная локализация** - все интерфейсы и сообщения на русском языке

## Архитектура

┌─────────────┐  ┌───────────────┐  ┌─────────────┐  ┌─────────────┐
│  Frontend   │  │    Backend    │  │ Database    │  │   LLM       │
│  (Angular)  │  │   (Django)    │  │(PostgreSQL) │  │ (Qwen2.5)   │
│             │  │               │  │             │  │             │
│Timeline UI  │◄─┤REST API       │◄─┤Models       │  │Text parsing │
│Upload forms │  │LangChain      │  │Plans        │  │Structured   │
│Notifications│  │File parsing   │  │Conflict data│  │extraction   │
│Russian i18n │  │Background jobs│  │Audit logs   │  │             │
└─────────────┘  └───────────────┘  └─────────────┘  └─────────────┘
                   

## Требования

- **Docker** >= 20.10
- **Docker Compose** >= 2.0
- **Свободное место**: ~8 ГБ (включая модель LLM)
- **ОЗУ**: минимум 8 ГБ (рекомендуется 16 ГБ)

## Быстрый старт

### 1. Подготовка модели LLM

- Установить CLI

```bash
pip install -U "huggingface_hub[cli]"
```

- Создать директорию для моделей

```bash
mkdir -p models
```

- Скачать оба шарда в папку ./models

```bash
huggingface-cli download Qwen/Qwen2.5-7B-Instruct-GGUF \
  --include "qwen2.5-7b-instruct-q4_k_m-*.gguf" \
  --local-dir ./models --local-dir-use-symlinks False
```

- Проверить, что оба файла на месте

```bash
ls -la models/ | grep qwen2.5-7b-instruct-q4_k_m-
```

### 2. Запуск системы

```bash
# Сборка и запуск всех сервисов
docker-compose up --build -d

# Проверка состояния сервисов
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

### 3. Проверка готовности

Дождитесь, пока все сервисы станут здоровыми (health checks):

```bash
# Проверка API backend
curl http://localhost:8001/api/health/

# Проверка frontend
curl http://localhost/health

# Проверка LLM
curl http://localhost:8000/v1/models
```

## Использование

### Веб-интерфейс

Откройте браузер и перейдите по адресу: **<http://localhost>**

#### Основные страницы

- **Дашборд** (`/`) - визуализация временной шкалы с задачами и простоями
- **Простои** (`/downtimes`) - извлечение простоев из протоколов
- **Конфликты** (`/conflicts`) - анализ пересечений планов и простоев

### Управление планами производства

#### Загрузка планов

1. На главной странице нажмите кнопку **"📤 Загрузить план"**
2. Выберите Excel файл (.xlsx/.xls) с планом производства
3. Дождитесь обработки файла

#### Просмотр и фильтрация планов

- Используйте фильтры по дате начала и окончания
- Выберите конкретную производственную линию
- Нажмите **"❌ Очистить"** для сброса фильтров

### API Endpoints

Полная документация API доступна по адресу: **<http://localhost:8001/api/docs/>**

#### Основные эндпоинты

```bash
# Асинхронное сканирование протоколов
POST /api/minutes/scan
curl -X POST -H "Content-Type: application/json" \
     -d '{"folder_path": "/app/data/minutes"}' \
     http://localhost:8001/api/minutes/scan

# Получение конфликтов
GET /api/conflicts
curl http://localhost:8001/api/conflicts

# Получение простоев
GET /api/downtimes
```

### Ручное тестирование

1. **Загрузите план производства на главной странице**

2. **Запустите сканирование протоколов:**

   ```bash
   curl -X POST -H "Content-Type: application/json" \
        -d '{"folder_path": "/app/data/minutes"}' \
        http://localhost:8001/api/minutes/scan
   ```

3. **Проверьте обнаруженные конфликты:**

   ```bash
   curl http://localhost:8001/api/conflicts | jq .
   ```

## Управление системой

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f backend
docker-compose logs -f qwen25
```

### Мониторинг ресурсов

```bash
# Использование ресурсов
docker stats

# Использование дискового пространства
docker system df
```

### Управление данными

```bash
# Резервное копирование базы данных
docker-compose exec db pg_dump -U scheduler_user scheduler_db > backup.sql

# Очистка логов
docker-compose exec backend python manage.py clear_logs

# Сброс демо-данных
docker-compose exec backend python manage.py flush --noinput
docker-compose exec backend python manage.py create_demo_data
```

## Конфигурация

### Переменные окружения

Основные настройки в `.env`:

```bash
# Размеры файлов
MAX_FILE_SIZE_MB=20                    # Максимальный размер файла
MAX_WINDOWS_PER_FILE=100               # Максимум окон текста на файл

# LLM настройки
LLM_TIMEOUT_S=25                       # Таймаут LLM (секунды)
LLM_RETRIES=2                          # Количество повторов
RAPIDFUZZ_THRESHOLD=82                 # Порог fuzzy matching

# База данных
DB_NAME=scheduler_db                   # Имя БД
DB_USER=scheduler_user                 # Пользователь БД
```

### Настройка псевдонимов линий

Добавьте и загрузите фикстуры из файлф `backend/fixtures/line_aliases.json`:

```json
{
  "Линия_66": [
    "производственная линия",
    "66-я линия", 
    "66-я",
    "линия 66",
    "фриз драй",
    "фриз-драй",
    "freeze dry",
    "freeze-dry"
  ]
}
```

Перезагрузите псевдонимы:

```bash
docker-compose exec backend python manage.py load_aliases
```

## Устранение проблем

### LLM не отвечает

```bash
# Проверьте статус LLM
curl http://localhost:8000/v1/models

# Перезапустите LLM сервис
docker-compose restart qwen25

# Проверьте логи LLM
docker-compose logs qwen25
```

### Ошибки валидации JSON

LLM может возвращать некорректный JSON. Система автоматически переключается на резервный парсер regex/dateparser.

### Проблемы с правами доступа к модели

```bash
# Установите правильные права на файлы модели
chmod 644 models/*.gguf
chown 1000:1000 models/*.gguf
```

### Ошибки миграции БД

```bash
# Пересоздайте базу данных
docker-compose down -v
docker-compose up -d db
docker-compose exec backend python manage.py migrate
```

### Проблемы с прокси Nginx

```bash
# Проверьте конфигурацию Nginx
docker-compose exec frontend nginx -t

# Перезагрузите Nginx
docker-compose restart frontend
```

## Разработка

### Подготовка среды разработки

```bash
# Backend разработка
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Frontend разработка  
cd frontend
npm install
npm run generate-types  # Генерация TypeScript типов из OpenAPI
```

### Запуск для разработки

```bash
# Backend (Django dev server)
cd backend
python manage.py runserver

# Frontend (Angular dev server)
cd frontend
npm start
```

## Производственное развертывание

### Мониторинг

Система логирует все события в JSON формате:

```bash
# Логи доступны в
./backend/logs/scheduler.log
./frontend/access.log
```

## Архитектурные решения

### LLM интеграция

- **LangChain** для унифицированного API
- **Структурированные выходы** через OpenAI-compatible endpoint
- **Резервный парсер** при сбоях LLM
- **Временные лимиты** и retry логика

### Обработка файлов

- **Chunking стратегия** для больших документов
- **SHA256 дедупликация** файлов
- **Идемпотентность** обработки
- **Audit trail** всех операций

### API дизайн

- **OpenAPI 3.1** спецификация
- **Единый формат ошибок** на русском языке
- **Асинхронные операции** для длительных задач

### Безопасность

- **Non-root контейнеры**
- **Валидация входных данных**
- **Санитизация файлов**
- **CORS отключен** (фронт и API на одном хосте)

## Поддержка

При возникновении проблем:

1. Проверьте [раздел устранения проблем](#устранение-проблем)
2. Посмотрите логи: `docker-compose logs`
3. Создайте issue с описанием проблемы и логами

---

🚀 **Готово к использованию!** Система полностью функциональна после выполнения команды `docker-compose up --build`
