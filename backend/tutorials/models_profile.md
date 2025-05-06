# Backend Tutorial: User Profile Model (`api/models.py`)

## What is a User Profile Model?

In Django, the built-in `User` model (`django.contrib.auth.models.User`) is primarily designed for handling authentication – things like username, email, password, permissions, and login status.

Often, applications need to store additional information about a user that isn't directly related to authentication, such as their job title, profile picture, institution, preferences, etc.

Instead of modifying the built-in `User` model directly (which is possible but more complex), the standard and recommended Django practice is to create a separate model, often called `UserProfile`, to hold this extra information.

## Why is it needed here?

Our UI registration form asks for "Institution" and "Role", which are not fields on the default Django `User` model. We need a place to store this information in the database, linked to the correct user.
The `UserProfile` model serves this purpose.

## How does `UserProfile` work?

```python
# From backend/api/models.py

from django.db import models
from django.conf import settings # Import settings to get the User model

class UserProfile(models.Model):
    # Link to the main User model
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, # If User is deleted, delete profile too
        related_name='profile'    # Allows access via user.profile
    )
    # Field for institution
    institution = models.CharField(max_length=255, blank=True, null=True)

    # Define choices for the role field
    class Role(models.TextChoices):
        OBSTETRICIAN = 'OB', 'Obstetrician'
        MIDWIFE = 'MW', 'Midwife'
        NURSE = 'NU', 'Nurse'
        GP = 'GP', 'GP'
        # Add more roles here if needed

    # Field for role, using the defined choices
    role = models.CharField(
        max_length=2,            # Max length matches the choice codes (e.g., 'OB')
        choices=Role.choices,    # Links to the Role enum above
        blank=True,
        null=True
    )
    # Timestamps for record creation/update
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        # How the profile object is represented as a string (e.g., in Django admin)
        return f"{self.user.username}'s Profile"
```

**Explanation:**

1.  **`user = models.OneToOneField(...)`**: This is the most critical field. It creates a strict one-to-one link between a `UserProfile` record and a `User` record.
    *   `settings.AUTH_USER_MODEL`: The recommended way to refer to Django's active User model.
    *   `on_delete=models.CASCADE`: If the associated `User` is deleted, this `UserProfile` record will also be automatically deleted.
    *   `related_name='profile'`: This allows easy access from a `User` object to its profile. For example, if you have a user object `u`, you can get their profile via `u.profile`.
2.  **`institution = models.CharField(...)`**: A simple text field to store the institution name. `blank=True, null=True` makes it optional in the database.
3.  **`class Role(models.TextChoices):`**: An enumeration defining the allowed values for the `role` field. Using `TextChoices` provides both a database value (e.g., `'OB'`) and a human-readable label (e.g., `'Obstetrician'`).
4.  **`role = models.CharField(..., choices=Role.choices, ...)`**: A text field to store the selected role. The `choices` argument links it to the `Role` enumeration, ensuring only valid roles can be stored and providing automatic validation and dropdowns in forms (like the Django admin).
5.  **Timestamps:** `created_at` and `updated_at` automatically track when the profile record was created and last modified.
6.  **`__str__(self)`**: Defines how a `UserProfile` object should be represented as a string, primarily used in the Django admin interface.

## How does it connect?

*   The `UserProfile` model is linked directly to the `User` model via the `OneToOneField`.
*   The `UserSerializer` (in `api/serializers.py`) was updated to accept `institution` and `role` data during registration.
*   The `create` method within the `UserSerializer` is responsible for creating the `UserProfile` instance and linking it to the newly created `User` instance after the User is saved.
*   The Django admin (`api/admin.py`) can be configured to show `UserProfile` data alongside `User` data (e.g., using an `InlineModelAdmin`). 