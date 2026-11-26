import csv
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta

from django.db import connections
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Prefetch, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission, role_for
from asistencias.models import Attendance, AttendanceRequest, Schedule
from asistencias.serializers import PeriodInput
from asistencias.services import attendance_period, employed_workers
from inventario.models import InventoryIncident
from pedidos.models import Order, OrderItem, Payment
from pedidos.serializers import OrderSerializer
from pedidos.views import visible_orders
from productos.models import Product
from trabajadores.models import Worker

DAY = timedelta(days=1)
Q_READY = Q(status__in=[Order.Status.READY, Order.Status.DELIVERED])


def ordered_between(queryset, start, end):
    lower = timezone.make_aware(datetime.combine(start, time.min))
    upper = timezone.make_aware(datetime.combine(end + DAY, time.min))
    return queryset.filter(created_at__gte=lower, created_at__lt=upper)


def distribution(orders):
    counts = dict(orders.order_by().values("status").annotate(count=Count("pk")).values_list("status", "count"))
    return [{"status": status, "count": counts.get(status, 0)} for status in Order.Status.values]


def _bucket_date(date, group):
    if group == "week":
        return date - timedelta(days=date.weekday())
    if group == "month":
        return date.replace(day=1)
    return date


def timeline(orders, start, end, group="day"):
    if connections[orders.db].features.has_zoneinfo_database:
        trunc = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}[group]
        buckets = orders.order_by().annotate(bucket=trunc("created_at")).values("bucket").annotate(count=Count("pk"))
        counts = {
            (row["bucket"].date() if isinstance(row["bucket"], datetime) else row["bucket"]): row["count"]
            for row in buckets
        }
    else:
        # Las instalaciones locales de MySQL pueden omitir las tablas de zonas horarias.
        dates = orders.order_by().values_list("created_at", flat=True).iterator(chunk_size=2000)
        counts = Counter(_bucket_date(timezone.localdate(stamp), group) for stamp in dates)
    start = _bucket_date(start, group)
    result = []
    while start <= end:
        result.append({"date": start.isoformat(), "count": counts.get(start, 0)})
        if group == "month":
            start = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        else:
            start += timedelta(days=7 if group == "week" else 1)
    return result


def available_products():
    return Product.objects.filter(is_active=True)


def low_stock():
    return available_products().filter(stock__lte=F("minimum_stock"))


def attendance_snapshot(selected, today):
    workers = employed_workers(selected, selected).prefetch_related(Prefetch(
        "schedules", queryset=Schedule.objects.filter(effective_from__lte=selected).select_related("shift"),
        to_attr="effective_schedules",
    ))
    planned = {
        worker.pk for worker in workers if worker.effective_schedules
        and selected.weekday() in worker.effective_schedules[0].shift.workdays
    }
    confirmations = Attendance.objects.filter(date=selected)
    confirmed_ids = set(confirmations.values_list("worker_id", flat=True))
    counts, _ = attendance_metrics(selected, selected)
    active = len(confirmed_ids)
    if selected == today:
        active = Attendance.objects.filter(
            clock_out__isnull=True, expected_out__gte=timezone.make_aware(datetime.combine(today, time.min)),
        ).count()
    return {**counts, "at_work": active, "scheduled": len(planned | confirmed_ids)}


class DashboardDate(serializers.Serializer):
    date = serializers.DateField(required=False)

    def validate_date(self, value):
        if value.year < 1900 or value > timezone.localdate():
            raise serializers.ValidationError("Selecciona una fecha válida hasta hoy.")
        return value


class DashboardView(APIView):
    def get(self, request):
        filters = DashboardDate(data=request.query_params)
        filters.is_valid(raise_exception=True)
        role = role_for(request.user)
        today = timezone.localdate()
        selected = filters.validated_data.get("date", today)
        orders = visible_orders(request.user)
        week = selected - timedelta(days=6)
        daily_orders = ordered_between(orders, selected, selected)
        recent = orders.select_related("seller", "customer", "assignee__user").order_by("-created_at", "-pk")
        context = {"request": request}
        data = {
            "date": selected.isoformat(), "today": today.isoformat(),
            "orders_today": daily_orders.count(),
            "pending": orders.filter(status=Order.Status.PENDING).count(),
            "ready": orders.filter(status=Order.Status.READY).count(),
            "completed": orders.filter(status=Order.Status.DELIVERED).count(),
            "products": available_products().count(),
            "low_stock": low_stock().count(),
            "trend": timeline(ordered_between(orders, week, selected), week, selected),
            "statuses": distribution(orders),
            "recent": OrderSerializer(
                (ordered_between(recent, selected, selected) if role == "admin" else recent)[:6],
                many=True, context=context,
            ).data,
        }
        if role in ("admin", "seller"):
            payments = Payment.objects.filter(order__in=orders, status=Payment.Status.PAID)
            today_payments = ordered_between(payments, selected, selected)
            totals = today_payments.aggregate(total=Sum("amount", default=0), count=Count("pk"))
            data["paid_today"] = str(totals["total"])
            data["paid_count"] = totals["count"]
        if role in ("admin", "warehouse"):
            incidents = InventoryIncident.objects.exclude(status=InventoryIncident.Status.RESOLVED)
            if role == "warehouse":
                incidents = incidents.filter(reporter=request.user)
            data["open_incidents"] = incidents.count()
        if role == "admin":
            attendance = attendance_snapshot(selected, today)
            inventory_value = ExpressionWrapper(F("stock") * F("price"), output_field=DecimalField(
                max_digits=24, decimal_places=2,
            ))
            by_category = available_products().order_by("category_id").values("category_id", "category__name").annotate(
                quantity=Sum("stock"), value=Sum(inventory_value),
            )
            data.update(
                present=attendance["at_work"], late=attendance["late"], overtime=attendance["overtime"],
                attendance=attendance,
                pending_attendance=AttendanceRequest.objects.filter(status=AttendanceRequest.Status.PENDING).count(),
                alerts=list(low_stock().order_by("stock", "pk").values("sku", "name", "stock", "minimum_stock", "category__name")[:5]),
                inventory_by_category=[{"name": row["category__name"], "quantity": row["quantity"],
                                        "value": str(row["value"])} for row in by_category],
                employed=employed_workers(selected, selected).filter(user__is_active=True).count(),
            )
        if role == "warehouse":
            assigned = recent.filter(assignee__user=request.user)
            data["assigned"] = assigned.filter(status__in=[Order.Status.ACCEPTED, Order.Status.PREPARING]).count()
            data["pending_recent"] = OrderSerializer(recent.filter(status=Order.Status.PENDING)[:5], many=True, context=context).data
            data["assigned_recent"] = OrderSerializer(assigned[:5], many=True, context=context).data
        return Response(data)


class ReportInput(PeriodInput):
    group = serializers.ChoiceField(choices=["day", "week", "month"], default="day")
    max_days = 366


def workers_activity(orders):
    rows = orders.exclude(assignee=None).order_by().values(
        "assignee", "assignee__user__username", "assignee__user__first_name", "assignee__user__last_name",
    ).annotate(assigned=Count("pk"), ready=Count("pk", filter=Q_READY)).order_by("-assigned", "assignee")
    return [{
        "worker": row["assignee"],
        "name": " ".join(filter(None, [row["assignee__user__first_name"], row["assignee__user__last_name"]]))
                or row["assignee__user__username"],
        "assigned": row["assigned"], "ready": row["ready"],
    } for row in rows]


def attendance_metrics(start, end):
    totals = Counter()
    days = defaultdict(Counter)
    workers = Worker.objects.filter(joined_on__lte=end).select_related("user").order_by("pk")
    for _, date, record, _ in attendance_period(workers, start, end):
        metrics = {
            "present": int(record is not None), "absent": int(record is None),
            "late": int(bool(record and record.late_minutes)),
            "overtime": record.approved_overtime if record else 0,
        }
        totals.update(metrics)
        days[date].update(metrics)
    trend = [{"date": date.isoformat(), **values} for date, values in sorted(days.items())]
    return {key: totals[key] for key in ("present", "absent", "late", "overtime")}, trend


def report_data(start, end, group):
    orders = ordered_between(Order.objects.all(), start, end)
    attendance, attendance_trend = attendance_metrics(start, end)
    payments = ordered_between(Payment.objects.all(), start, end).order_by()
    payment_rows = payments.values("method").annotate(
        count=Count("pk", filter=Q(status=Payment.Status.PAID)),
        voided=Count("pk", filter=Q(status=Payment.Status.VOIDED)),
        amount=Sum("amount", filter=Q(status=Payment.Status.PAID), default=0),
    ).order_by("method")
    incidents = ordered_between(InventoryIncident.objects.all(), start, end).order_by()
    incident_rows = incidents.values("status").annotate(count=Count("pk")).order_by("status")
    return {
        "active_workers": employed_workers(start, end).filter(user__is_active=True).count(),
        "payments": [{**row, "amount": str(row["amount"])} for row in payment_rows],
        "incidents": list(incident_rows),
        "trend": timeline(orders, start, end, group), "statuses": distribution(orders),
        "top_products": list(OrderItem.objects.filter(order__in=orders.exclude(status=Order.Status.CANCELLED))
                             .values("product_id").annotate(
                                 quantity=Sum("quantity"), sku=F("product__sku"), name=F("product__name"),
                             ).order_by("-quantity", "product_id")[:10]),
        "low_stock": list(low_stock().order_by("stock", "pk").values("sku", "name", "stock", "minimum_stock")),
        "workers": workers_activity(orders), "attendance": attendance, "attendance_trend": attendance_trend,
    }


class ReportView(APIView):
    permission_classes = [RolePermission]
    allowed_roles = ["admin"]
    download = False

    def get(self, request):
        filters = ReportInput(data=request.query_params)
        filters.is_valid(raise_exception=True)
        period = filters.validated_data
        data = report_data(period["start"], period["end"], period["group"])
        if not self.download:
            return Response(data)

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="control360-reportes.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow(["Sección", "Etiqueta", "Indicador", "Valor"])
        for section, label in {
            "trend": "date", "statuses": "status", "top_products": "sku", "low_stock": "sku",
            "workers": "name", "attendance_trend": "date",
        }.items():
            for row in data[section]:
                name = row[label]
                if name.lstrip(" ").startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
                    name = "'" + name
                for key, value in row.items():
                    if key not in (label, "worker", "product_id") and isinstance(value, int):
                        writer.writerow([section, name, key, value])
        for row in data["payments"]:
            for key in ("count", "voided", "amount"):
                writer.writerow(["payments", row["method"], key, row[key]])
        for row in data["incidents"]:
            writer.writerow(["incidents", row["status"], "count", row["count"]])
        for key, value in data["attendance"].items():
            writer.writerow(["attendance", "Total", key, value])
        return response
