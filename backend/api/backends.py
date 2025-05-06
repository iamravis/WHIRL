from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model

UserModel = get_user_model()

class EmailBackend(ModelBackend):
    """
    Authenticates against settings.AUTH_USER_MODEL using email field.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        # The `username` argument here will actually be the email provided by the user
        # because our custom JWT serializer uses the email field.
        try:
            # Case-insensitive email lookup
            user = UserModel.objects.get(email__iexact=username)
        except UserModel.DoesNotExist:
            # Run the default password hasher once to reduce the timing
            # difference between an existing and a nonexistent user (#20760).
            UserModel().set_password(password)
            return None # User not found with this email
        except UserModel.MultipleObjectsReturned:
            # This condition should ideally not happen if emails are unique.
            # Handle appropriately, e.g., log an error or return None.
            return None 

        # Check password and is_active status
        password_correct = user.check_password(password)
        can_authenticate = self.user_can_authenticate(user)
        if password_correct and can_authenticate:
            return user
            
        return None

    # Optional: Implement get_user if needed for other parts of auth system
    # def get_user(self, user_id):
    #     try:
    #         return UserModel.objects.get(pk=user_id)
    #     except UserModel.DoesNotExist:
    #         return None 