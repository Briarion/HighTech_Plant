"""
URL patterns для основного приложения
"""
from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.health_check, name='health-check'),
    path('live/', views.health_live, name='health-live'),
    path('ready/', views.health_ready, name='health-ready'),
]