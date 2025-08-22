from rest_framework import serializers
from .models import ScanJob


class ScanJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScanJob
        fields = [
            "id",
            "status",
            "progress",
            "message",
            "results",
            "created_at",
            "completed_at",
        ]
