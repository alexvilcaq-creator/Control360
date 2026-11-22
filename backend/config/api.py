import logging

from django.db import IntegrityError
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class Conflict(APIException):
    status_code = 409
    default_detail = "La operación entra en conflicto con el estado actual."


def handle_exception(error, context):
    response = exception_handler(error, context)
    if response is not None:
        return response
    if isinstance(error, IntegrityError):
        return Response({"detail": "Hay un registro duplicado o una relación protegida."}, status=409)
    logger.error("Error al procesar una operación de la API", exc_info=error)
    return Response({"detail": "Ocurrió un error interno."}, status=500)
