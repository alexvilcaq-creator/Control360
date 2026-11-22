import csv
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import RolePermission, role_for
from asistencias.models import Attendance
from asistencias.serializers import PeriodInput
from asistencias.services import attendance_period
from pedidos.models import Order, OrderItem
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


def timeline(orders, start, end, group="day"):
    trunc = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}[group]
    raw = orders.order_by().annotate(bucket=trunc("created_at")).values("bucket").annotate(count=Count("pk"))
    counts = {(item["bucket"].date() if isinstance(item["bucket"], datetime) else item["bucket"]): item["count"]
              for item in raw}
    if group == "week":
        start -= timedelta(days=start.weekday())
    if group == "month":
        start = start.replace(day=1)
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


class DashboardView(APIView):
    def get(self, request):
        role = role_for(request.user)
        today = timezone.localdate()
        orders = visible_orders(request.user)
        week = today - timedelta(days=6)
        data = {
            "orders_today": ordered_between(orders, today, today).count(),
            "pending": orders.filter(status=Order.Status.PENDING).count(),
            "completed": orders.filter(status=Order.Status.DELIVERED).count(),
            "products": available_products().count(),
            "low_stock": low_stock().count(),
            "trend": timeline(ordered_between(orders, week, today), week, today),
            "statuses": distribution(orders),
            "recent": OrderSerializer(
                orders.select_related("seller", "customer", "assignee__user").order_by("-created_at", "-pk")[:6],
                many=True, context={"request": request},
            ).data,
        }
        if role == "admin":
            today_rows = Attendance.objects.filter(date=today)
            data.update(
                present=Attendance.objects.filter(
                    clock_out__isnull=True, expected_out__gte=timezone.make_aware(datetime.combine(today, time.min)),
                ).count(),
                late=today_rows.filter(late_minutes__gt=0).count(),
                overtime=today_rows.aggregate(total=Sum("approved_overtime", default=0))["total"],
                alerts=list(low_stock().order_by("stock", "pk").values("sku", "name", "stock", "minimum_stock")[:5]),
            )
        if role == "warehouse":
            data["assigned"] = orders.filter(
                assignee__user=request.user, status__in=[Order.Status.ACCEPTED, Order.Status.PREPARING],
            ).count()
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
    return {
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
        for key, value in data["attendance"].items():
            writer.writerow(["attendance", "Total", key, value])
        return response
