from django.urls import path
from . import views # Import views from the current app
# Use our custom view for login
# Import class-based views and function views
from .views import (
    MyTokenObtainPairView, 
    UserProfileView, 
    ChatSessionListView, 
    ChatSessionDetailView,
    ProcessChatMessageView # Import the new class view
)
# from .views import process_chat_message_view # Old function view import (removed)
from rest_framework_simplejwt.views import (
    TokenRefreshView,    # Handles refreshing access tokens
)

# Define URL patterns for the api app
urlpatterns = [
    # Map the URL path 'auth/register/' to the register_user view
    path('auth/register/', views.register_user, name='register'),
    # JWT Authentication endpoints
    # Use the custom view for login which accepts email
    path('auth/login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'), 
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'), # Refresh token endpoint (renamed for frontend consistency)
    # Profile endpoint
    path('profile/me/', UserProfileView.as_view(), name='user_profile'),
    # Chat History endpoints
    path('chats/', ChatSessionListView.as_view(), name='chat_list'),
    path('chats/<uuid:id>/', ChatSessionDetailView.as_view(), name='chat_detail'), # Assuming ChatSession ID is UUID
    # Chat Processing endpoint - Use the new async CLASS view
    path('chat/stream/', ProcessChatMessageView.as_view(), name='process_chat_sse'),
    # Original endpoint for backward compatibility
    path('chat/', ProcessChatMessageView.as_view(), name='process_chat_sse_original'),
    # Endpoint to get a temporary token for SSE stream authentication
    path('get_stream_token/', views.get_stream_token_view, name='get_stream_token'),
    # We will add paths for logout, etc., later
] 