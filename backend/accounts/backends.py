from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class UsernameOrEmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None
        users = get_user_model()._default_manager
        if "@" in username and not users.filter(username=username).exists():
            matches = list(users.filter(email__iexact=username).values_list("username", flat=True)[:2])
            if len(matches) == 1:
                username = matches[0]
        return super().authenticate(request, username=username, password=password)
