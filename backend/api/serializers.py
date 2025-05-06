from django.contrib.auth.models import User
from rest_framework import serializers
# Import UserProfile model
from .models import UserProfile, Interaction, ChatSession
import uuid # To help generate unique usernames

# --- User Profile Serializer (Optional but good practice) ---
# This serializer is used to *display* profile information if needed
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('institution', 'role') # Add other fields if needed

# --- User Serializer for Registration (Modified) ---
class UserSerializer(serializers.ModelSerializer):
    # Add fields that are in the UI form but not directly on the User model
    # These are input-only fields for the serializer
    full_name = serializers.CharField(max_length=100, write_only=True)
    institution = serializers.CharField(max_length=255, required=False, allow_blank=True, write_only=True)
    role = serializers.CharField(max_length=50, required=False, allow_blank=True, write_only=True)
    # UserProfile data can also be represented as a nested serializer for reading
    profile = UserProfileSerializer(read_only=True) 

    class Meta:
        model = User
        # 'username' is removed from input, 'email', 'password' remain.
        # 'first_name', 'last_name' added for output
        fields = ('id', 'email', 'password', 'full_name', 'institution', 'role', 'first_name', 'last_name', 'profile')
        extra_kwargs = {
            'password': {'write_only': True},
            'first_name': {'read_only': True}, # Will be set from full_name
            'last_name': {'read_only': True}   # Will be set from full_name
        }

    def validate_email(self, value):
        """Check that the email is unique."""
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with that email already exists.")
        return value

    def validate_role(self, value):
        """Validate the provided role name and convert it to its internal code."""
        if not value: # Allow empty/None role if it's not required
             return None 
        
        # Case-insensitive mapping from label to value
        role_map = {label.lower(): value for value, label in UserProfile.Role.choices}
        role_code = role_map.get(value.lower())

        if not role_code:
            valid_roles = [label for _, label in UserProfile.Role.choices]
            raise serializers.ValidationError(f"Invalid role '{value}'. Valid roles are: {', '.join(valid_roles)}")
        
        return role_code # Return the internal code (e.g., 'OB')

    def create(self, validated_data):
        """Handle user and profile creation with username generation and name splitting."""
        # Extract profile data, remove from validated_data as it's not for User model
        profile_data = {
            'institution': validated_data.pop('institution', None),
            'role': validated_data.pop('role', None)
        }
        full_name = validated_data.pop('full_name')
        password = validated_data.pop('password')
        email = validated_data['email']

        # --- Username Generation ---
        # Simple approach: use email prefix + short random string
        # Ensure uniqueness (though collision is unlikely with uuid)
        username_base = email.split('@')[0].lower().replace('+', '').replace('.', '') # Basic cleaning
        username = f"{username_base}_{uuid.uuid4().hex[:6]}"
        while User.objects.filter(username=username).exists():
             username = f"{username_base}_{uuid.uuid4().hex[:6]}"

        # --- Full Name Splitting ---
        name_parts = full_name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        # --- User Creation ---
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )

        # --- UserProfile Creation ---
        # Only create profile if relevant data was provided
        if profile_data['institution'] or profile_data['role']:
             UserProfile.objects.create(user=user, **profile_data)
        # If profile fields are mandatory in UI, remove the checks above and 
        # potentially add validation to ensure they are provided.

        return user 

# --- Serializer for Displaying User Profile Details ---
class UserProfileDetailSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True) # Include nested profile info

    class Meta:
        model = User
        # Specify fields to include in the profile endpoint response
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'profile')
        read_only_fields = fields # Ensure this serializer is read-only

# --- Chat History Serializers ---
class InteractionSerializer(serializers.ModelSerializer):
    # Dynamically determine role based on which text field is present maybe?
    # Or maybe structure requires frontend to know query/response pairs.
    # For simplicity, let's represent a turn with user query and assistant response.
    # A better approach might involve two separate message objects per interaction.
    
    # Define role based on content source - this needs refinement based on how
    # the frontend expects messages (list of alternating user/assistant messages).
    # Let's assume for now the frontend wants distinct messages.
    # We might need to transform the data in the view or serializer method.
    
    # Simple representation for now:
    class Meta:
        model = Interaction
        fields = ('id', 'timestamp', 'query_text', 'final_response_text') 
        # Frontend will need to render query_text as 'user' role and final_response_text as 'assistant' role.

class ChatSessionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatSession
        fields = ('id', 'title', 'updated_at') # Or start_time/end_time
        read_only_fields = fields

class ChatSessionDetailSerializer(serializers.ModelSerializer):
    # Use InteractionSerializer for the nested messages
    # The related_name on Interaction model is 'interactions'
    interactions = InteractionSerializer(many=True, read_only=True)

    class Meta:
        model = ChatSession
        fields = ('id', 'title', 'updated_at', 'start_time', 'end_time', 'user', 'interactions')
        read_only_fields = fields 
        # Note: Including 'user' might be redundant if endpoint is already user-scoped

# --- Custom Token Serializer for Email Login ---
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import authenticate
from rest_framework import exceptions # Import exceptions
from rest_framework_simplejwt.settings import api_settings
from django.contrib.auth.models import update_last_login

class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = User.EMAIL_FIELD # Tell the serializer to use the email field

    # Override class method to add custom claims if needed (optional)
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Add custom claims
        # token['first_name'] = user.first_name
        # token['email'] = user.email 
        # ...
        return token

    def validate(self, attrs):
        # Use the field specified in username_field (which is email)
        email = attrs.get(self.username_field)
        password = attrs.get("password")

        data = {}

        if email and password:
            # Explicitly call authenticate with email as username using configured backends
            user = authenticate(request=self.context.get('request'),
                                username=email, password=password)

            if not user:
                msg = 'No active account found with the given credentials'
                raise exceptions.AuthenticationFailed(msg, code='authentication')

            # Check if user is active (redundant if EmailBackend checks, but safe)
            if not user.is_active:
                msg = 'User account is disabled.'
                raise exceptions.AuthenticationFailed(msg, code='authentication')

            # Authentication successful, generate tokens directly
            refresh = self.get_token(user)

            data["refresh"] = str(refresh)
            data["access"] = str(refresh.access_token)

            # Optional: Update last login time
            if api_settings.UPDATE_LAST_LOGIN:
                update_last_login(None, user)

            return data
        else:
            msg = 'Must include "email" and "password".'
            raise exceptions.ValidationError(msg, code='authorization')

    # Optional: Add custom claims to the token payload
    # @classmethod ... (keep this if you want custom claims later)