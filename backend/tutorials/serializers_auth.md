# Backend Tutorial: Authentication Serializers (`api/serializers.py`)

## What are Serializers (in DRF)?

Think of serializers as translators. Our Next.js frontend will send and receive data in **JSON** format (a common standard for web APIs). Our Django backend, however, works with Python objects, specifically Django **model instances** (like the `User` model).

A Django REST Framework (DRF) `Serializer` translates complex data types, like Django model instances, into JSON format that can be easily sent back to the frontend. Conversely, it also translates incoming JSON data from the frontend into validated Python data structures (like dictionaries) or even directly into model instances, ensuring the data is correct before we save it to the database.

## Why are they needed here?

For user authentication, we need serializers to handle the data flow for:

1.  **Registration:** Translating the incoming JSON (email, password, full name, institution, role) from the frontend's registration form into a format suitable for creating a new Django `User` model instance *and* its associated `UserProfile`, ensuring the data is valid, the username is auto-generated, the full name is split, and the password gets hashed correctly.
2.  **(Later) Login:** While login doesn't typically involve creating data, a serializer can help validate the incoming email/password format.
3.  **(Later) User Profile:** Displaying user information might involve serializing the `User` model and its related `UserProfile` (excluding sensitive fields like the password).

## How does the *Updated* `UserSerializer` work?

```python
# From backend/api/serializers.py

from django.contrib.auth.models import User
from rest_framework import serializers
from .models import UserProfile # Import UserProfile model
import uuid # To help generate unique usernames

# --- User Profile Serializer (Helper for displaying profile data) ---
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('institution', 'role')

# --- User Serializer for Registration (Modified) ---
class UserSerializer(serializers.ModelSerializer):
    # Fields from UI form (write_only as they are input)
    full_name = serializers.CharField(max_length=100, write_only=True)
    institution = serializers.CharField(max_length=255, required=False, allow_blank=True, write_only=True)
    role = serializers.ChoiceField(choices=UserProfile.Role.choices, required=False, write_only=True)
    # Field to display profile data (read_only)
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        # Specify fields used for input validation AND output representation
        fields = (
            'id', 'email', 'password', # Core User fields (password is input only)
            'full_name', 'institution', 'role', # Input fields for profile
            'first_name', 'last_name', # Output fields derived from full_name
            'profile' # Output field showing nested profile data
        )
        extra_kwargs = {
            'password': {'write_only': True},
            'first_name': {'read_only': True},
            'last_name': {'read_only': True}
        }

    def validate_email(self, value):
        # Ensures email uniqueness during registration
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value

    def create(self, validated_data):
        # Extract profile-related data
        profile_data = {
            'institution': validated_data.pop('institution', None),
            'role': validated_data.pop('role', None)
        }
        full_name = validated_data.pop('full_name')
        password = validated_data.pop('password')
        email = validated_data['email']

        # Auto-generate a unique username
        username_base = email.split('@')[0].lower().replace('+', '').replace('.', '')
        username = f"{username_base}_{uuid.uuid4().hex[:6]}"
        while User.objects.filter(username=username).exists():
            username = f"{username_base}_{uuid.uuid4().hex[:6]}"

        # Split full_name into first_name and last_name
        name_parts = full_name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        # Create the User object (hashes password automatically)
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )

        # Create the associated UserProfile
        UserProfile.objects.create(user=user, **profile_data)

        return user
```

**Explanation of Key Changes:**

1.  **Imports:** Added `UserProfile` and `uuid`.
2.  **`UserProfileSerializer`:** A simple serializer just for displaying the `institution` and `role` from the `UserProfile` model.
3.  **New Fields in `UserSerializer`:**
    *   `full_name`, `institution`, `role`: Added as input fields (`write_only=True`). `institution` and `role` are optional (`required=False`).
    *   `profile = UserProfileSerializer(read_only=True)`: Added to allow showing the nested profile data (institution, role) when returning the user details after creation.
4.  **`Meta.fields`:** Updated to include all relevant input and output fields. `username` is no longer an input field.
5.  **`validate_email`:** Added to ensure emails are unique.
6.  **`create` Method Logic:**
    *   Extracts `institution` and `role` for later use.
    *   Extracts `full_name` and `password`.
    *   **Generates `username`:** Creates a unique username from the email prefix and a random string.
    *   **Splits `full_name`:** Implements the logic to split the name into `first_name` and `last_name`.
    *   Calls `User.objects.create_user` with all derived/provided fields (email, password, generated username, first_name, last_name).
    *   Calls `UserProfile.objects.create` to create the linked profile record using the extracted `institution` and `role`.

## How does it connect?

*   The updated `UserSerializer` is still used by the `register_user` view in `api/views.py`.
*   The view now expects JSON data including `email`, `password`, `full_name`, and optionally `institution` and `role`.
*   When `serializer.save()` is called in the view, this updated `create` method handles all the necessary logic to create both the `User` and `UserProfile` correctly.
*   The response from the view will now potentially include the `first_name`, `last_name`, and nested `profile` data (institution, role) in addition to the `id` and `email`. 