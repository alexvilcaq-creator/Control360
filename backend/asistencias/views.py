from collections import Counter, defaultdict

from django.db import transaction
from django.utils import timezone
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import RolePermission, role_for
from config.api import Conflict
from trabajadores.models import Worker
from .models import Attendance, AttendanceRequest, Schedule, Shift
from .serializers import (
    AttendanceRequestSerializer, AttendanceSerializer, CorrectionInput, CorrectionSerializer,
    DecisionInput, PeriodInput, PunchInput, ScheduleSerializer, ShiftSerializer,
)
from .services import (
    approve, attendance_period, attendance_state, correct_attendance, decide_punch, request_punch, scheduled_bounds,
)


class ShiftViewSet(viewsets.ModelViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin"]
    queryset = Shift.objects.order_by("name", "pk")
    serializer_class = ShiftSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    @transaction.atomic
    def perform_update(self, serializer):
        shift = Shift.objects.select_for_update().get(pk=serializer.instance.pk)
        if shift.schedules.exists():
            raise Conflict("Crea otro turno para cambiar las reglas sin modificar el historial.")
        serializer.save()


class ScheduleViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin,
                      viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin"]
    queryset = Schedule.objects.select_related("worker__user", "shift").order_by("-effective_from", "-pk")
    serializer_class = ScheduleSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        date = serializer.validated_data["effective_from"]
        worker = Worker.objects.select_for_update().get(pk=serializer.validated_data["worker"].pk)
        shift = Shift.objects.select_for_update().get(pk=serializer.validated_data["shift"].pk)
        if worker.attendance.filter(date__gte=date).exists():
            raise Conflict("La asignación modificaría un turno con asistencia registrada.")
        serializer.save(worker=worker, shift=shift)

    @transaction.atomic
    def perform_destroy(self, instance):
        Worker.objects.select_for_update().get(pk=instance.worker_id)
        if instance.effective_from <= timezone.localdate():
            raise Conflict("Solo se puede retirar una asignación futura.")
        instance.delete()


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin", "seller", "warehouse"]
    action_roles = {
        "punch": ["seller", "warehouse"], "state": ["seller", "warehouse"],
        "overtime": ["admin"], "correct": ["admin"], "corrections": ["admin"],
    }
    serializer_class = AttendanceSerializer

    def get_queryset(self):
        queryset = Attendance.objects.select_related("worker__user", "schedule__shift").order_by("-date", "-pk")
        if role_for(self.request.user) != "admin":
            queryset = queryset.filter(worker__user=self.request.user)
        return queryset

    @action(detail=False, methods=["post"])
    def punch(self, request):
        data = PunchInput(data=request.data)
        data.is_valid(raise_exception=True)
        record = request_punch(request.user, data.validated_data["action"])
        return Response(AttendanceRequestSerializer(record).data, status=201)

    @action(detail=False)
    def state(self, request):
        worker = Worker.objects.filter(user=request.user).first()
        if not worker:
            return Response({"linked": False, "schedule": None, "open": False, "pending": False, "can_request": False})
        return Response(attendance_state(worker))

    @action(detail=True, methods=["post"])
    def correct(self, request, pk=None):
        data = CorrectionInput(data=request.data)
        data.is_valid(raise_exception=True)
        entry = correct_attendance(self.get_object(), request.user, **data.validated_data)
        return Response(self.get_serializer(entry).data)

    @action(detail=True)
    def corrections(self, request, pk=None):
        records = self.get_object().corrections.select_related("actor")
        return self.get_paginated_response(CorrectionSerializer(self.paginate_queryset(records), many=True).data)

    @action(detail=True, methods=["post"])
    def overtime(self, request, pk=None):
        class OvertimeInput(serializers.Serializer):
            minutes = serializers.IntegerField(min_value=0, max_value=2147483647)

        record = self.get_object()
        data = OvertimeInput(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(self.get_serializer(approve(record.pk, data.validated_data["minutes"])).data)

    @action(detail=False, url_path="open")
    def open_status(self, request):
        return Response({"open": self.get_queryset().filter(clock_out__isnull=True).exists()})

    @action(detail=False)
    def calendar(self, request):
        data = PeriodInput(data=request.query_params)
        data.is_valid(raise_exception=True)
        start, end = data.validated_data["start"], data.validated_data["end"]
        # Incluye marcaciones existentes aunque después se corrija el vínculo laboral.
        workers = Worker.objects.select_related("user").order_by("pk")
        if role_for(request.user) != "admin":
            workers = workers.filter(user=request.user)
        elif data.validated_data.get("worker"):
            workers = workers.filter(pk=data.validated_data["worker"])
        rows = []
        for worker, date, record, schedule in attendance_period(workers, start, end):
            if record:
                rows.append(self.get_serializer(record).data)
            else:
                expected_in, expected_out = scheduled_bounds(schedule, date)
                rows.append({"id": None, "worker": worker.pk, "worker_name": str(worker), "date": date,
                             "shift_name": schedule.shift.name, "expected_in": expected_in,
                             "expected_out": expected_out, "status": "absent"})
        rows.sort(key=lambda row: (str(row["date"]), row["worker"]), reverse=True)
        daily = defaultdict(Counter)
        for row in rows:
            daily[str(row["date"])][row["status"]] += 1
        paginator = self.paginator
        response = paginator.get_paginated_response(paginator.paginate_queryset(rows, request, view=self))
        response.data["days"] = daily
        return response


class AttendanceRequestViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [RolePermission]
    allowed_roles = ["admin", "seller", "warehouse"]
    action_roles = {"decide": ["admin"]}
    serializer_class = AttendanceRequestSerializer

    def get_queryset(self):
        queryset = AttendanceRequest.objects.select_related("worker__user", "schedule__shift", "reviewed_by")
        if role_for(self.request.user) != "admin":
            queryset = queryset.filter(worker__user=self.request.user)
        state = self.request.query_params.get("status")
        if self.action == "list" and state:
            if state not in AttendanceRequest.Status.values:
                raise serializers.ValidationError({"status": "Estado de solicitud inválido."})
            queryset = queryset.filter(status=state)
        return queryset.order_by("-requested_at", "-pk")

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        data = DecisionInput(data=request.data)
        data.is_valid(raise_exception=True)
        punch = decide_punch(self.get_object(), request.user, **data.validated_data)
        return Response(self.get_serializer(punch).data)
