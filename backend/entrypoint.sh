#!/usr/bin/env sh
set -e

# Применяем миграции на старте
python manage.py makemigrations --noinput

python manage.py migrate --noinput

# Для MVP оставим runserver (в проде используйте gunicorn+daphne/uvicorn при необходимости ASGI)
exec python manage.py runserver 0.0.0.0:8000
