from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts import views as auth
from asistencias.views import AttendanceViewSet, ScheduleViewSet, ShiftViewSet
from clientes.views import CustomerViewSet
from notificaciones.views import NotificationViewSet
from pedidos.views import OrderViewSet
from productos import views as catalog
from reportes.views import DashboardView, ReportView
from trabajadores.views import WorkerViewSet

router = DefaultRouter()
router.register("categories", catalog.CategoryViewSet)
router.register("locations", catalog.LocationViewSet)
router.register("products", catalog.ProductViewSet)
router.register("accounts", auth.AccountViewSet)
router.register("customers", CustomerViewSet)
router.register("orders", OrderViewSet, basename="order")
router.register("workers", WorkerViewSet)
router.register("shifts", ShiftViewSet)
router.register("schedules", ScheduleViewSet)
router.register("attendance", AttendanceViewSet, basename="attendance")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/csrf/", auth.csrf),
    path("api/v1/auth/login/", auth.login),
    path("api/v1/auth/me/", auth.me),
    path("api/v1/auth/logout/", auth.logout),
    path("api/v1/summary/", catalog.summary),
    path("api/v1/dashboard/", DashboardView.as_view()),
    path("api/v1/reports/", ReportView.as_view()),
    path("api/v1/reports/export/", ReportView.as_view(download=True)),
    path("api/v1/", include(router.urls)),
]
