"""
URL configuration for scheduler project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from apps.notifications import views as notification_views

# API URL patterns
api_patterns = [
    path('', include('apps.production.urls')),
    path('', include('apps.extraction.urls')),
    path('notifications/', include('apps.notifications.urls')),
    path('stream/notifications/', notification_views.notification_stream, name='notification-sse-stream'),
    path('health/', include('apps.core.urls')),
]

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    
    # API
    path('api/', include(api_patterns)),
    
    # OpenAPI schema
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

# Static and media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)