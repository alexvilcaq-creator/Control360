from django.utils import timezone
from rest_framework import serializers

from config.api import Conflict
from trabajadores.models import Worker
from .models import Attendance, Schedule, Shift


class ShiftSerializer(serializers.ModelSerializer):
    workdays = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=6),
                                     allow_empty=False, max_length=7, required=False)

    class Meta:
        model = Shift
        fields = ["id", "name", "starts_at", "ends_at", "workdays", "grace_minutes", "overtime_minimum"]

    def validate_workdays(self, values):
        if len(set(values)) != len(values):
            raise serializers.ValidationError("No repitas días.")
        return sorted(values)

    def validate(self, attrs):
        shift = self.instance
        start = attrs.get("starts_at", shift and shift.starts_at)
        end = attrs.get("ends_at", shift and shift.ends_at)
        if start == end:
            raise serializers.ValidationError("La hora de entrada debe diferir de la salida.")
        return attrs


class ScheduleSerializer(serializers.ModelSerializer):
    worker = serializers.PrimaryKeyRelatedField(queryset=Worker.objects.all())
    shift_name = serializers.CharField(source="shift.name", read_only=True)
    worker_name = serializers.CharField(source="worker.__str__", read_only=True)

    class Meta:
        model = Schedule
        fields = ["id", "worker", "worker_name", "shift", "shift_name", "effective_from"]

    def validate(self, attrs):
        worker, date = attrs["worker"], attrs["effective_from"]
        if date < timezone.localdate() or not worker.employed_on(date):
            raise serializers.ValidationError("La fecha debe ser actual o futura y estar dentro del vínculo laboral.")
        return attrs


class AttendanceSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source="worker.__str__", read_only=True)
    shift_name = serializers.CharField(source="schedule.shift.name", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = ["id", "worker", "worker_name", "shift_name", "date", "expected_in", "expected_out",
                  "clock_in", "clock_out", "late_minutes", "extra_minutes", "approved_overtime", "status"]

    def get_status(self, entry):
        return "present" if entry.clock_out else "open"


class PeriodInput(serializers.Serializer):
    start = serializers.DateField(required=False)
    end = serializers.DateField(required=False)
    worker = serializers.IntegerField(required=False, min_value=1, max_value=9223372036854775807)
    max_days = 92

    def validate(self, attrs):
        end = attrs.get("end", timezone.localdate())
        start = attrs.get("start", end.replace(day=1))
        if start.year < 1900 or end.year > 9998 or start > end or (end - start).days >= self.max_days:
            raise serializers.ValidationError(f"Indica un período válido de hasta {self.max_days} días.")
        return {**attrs, "start": start, "end": end}
