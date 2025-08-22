FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=1.8.3

# Системные зависимости
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev libmagic1 curl \
    && rm -rf /var/lib/apt/lists/*

# Пользователь и рабочая директория
RUN useradd --create-home --uid 1000 app
WORKDIR /app

# Poetry и deps (используем кэш слоёв)
RUN pip install --no-cache-dir "poetry==$POETRY_VERSION" && \
    poetry config virtualenvs.create false

# ВАЖНО: копируем оба файла зависимостей
COPY pyproject.toml ./
RUN poetry install --only main --no-interaction --no-ansi --no-root

# Исходники
COPY . .

# Директории и права
RUN mkdir -p media logs data/minutes static && chown -R app:app /app

USER app

# Сборка статики (если храните локально в образе)
RUN python manage.py collectstatic --noinput

# entrypoint запустит migrate и сервер
USER root
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown app:app /entrypoint.sh
USER app

EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
