# Standard library imports
import json
import logging
import os
import time
import uuid
from urllib.parse import unquote

# Django imports
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

# Django REST Framework imports
from rest_framework import status, exceptions
from rest_framework.decorators import api_view, permission_classes as drf_permission_classes, authentication_classes, renderer_classes
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views import View
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework.exceptions import AuthenticationFailed

# Third-party imports
import asyncio
import httpx
from asgiref.sync import sync_to_async

# Local imports
from .models import ChatSession, Interaction, UserProfile
from .serializers import (
    ChatSessionDetailSerializer,
    ChatSessionListSerializer,
    MyTokenObtainPairSerializer,
    UserProfileDetailSerializer,
    UserSerializer
)

# Configure logging
logger = logging.getLogger(__name__)

# ============================================================================
# Authentication Views
# ============================================================================

@api_view(['POST'])
@drf_permission_classes([AllowAny])
def register_user(request):
    """Handle user registration requests."""
    if request.method == 'POST':
        logger.debug("Registration data received:", request.data)
        serializer = UserSerializer(data=request.data)
        
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            logger.error("Validation errors:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class MyTokenObtainPairView(TokenObtainPairView):
    """Custom token view for email-based login."""
    serializer_class = MyTokenObtainPairSerializer

# --- New View for Stream Token ---
from django.core.signing import Signer, BadSignature, SignatureExpired
from django.core.signing import TimestampSigner

# This view requires authentication by default due to REST_FRAMEWORK settings
@api_view(['GET'])
def get_stream_token_view(request):
    """Generates a short-lived signed token for SSE stream authentication."""
    user = request.user
    if not user or not user.is_authenticated:
        # Should typically be caught by default permissions, but good to double-check
        return Response({"error": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Create a signer instance (uses settings.SECRET_KEY)
    signer = TimestampSigner()
    # Sign the user ID
    signed_user_id = signer.sign(str(user.id))
    
    # Return the signed token
    return Response({"stream_token": signed_user_id}, status=status.HTTP_200_OK)
# --- End New View ---

# ============================================================================
# User Profile Views
# ============================================================================

class UserProfileView(RetrieveAPIView):
    """API endpoint for users to view their own profile details."""
    serializer_class = UserProfileDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

# ============================================================================
# Chat Session Views
# ============================================================================

class ChatSessionListView(ListAPIView):
    """API endpoint to list chat sessions for authenticated users."""
    serializer_class = ChatSessionListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user).order_by('-updated_at')

class ChatSessionDetailView(RetrieveAPIView):
    """API endpoint to retrieve specific chat session details."""
    serializer_class = ChatSessionDetailSerializer
    permission_classes = [IsAuthenticated]
    queryset = ChatSession.objects.all()
    lookup_field = 'id'

    def get_queryset(self):
        return super().get_queryset().filter(user=self.request.user)

# ============================================================================
# Streaming Response Components
# ============================================================================

class PassthroughRenderer(BaseRenderer):
    """Custom renderer for StreamingHttpResponse compatibility."""
    media_type = 'text/event-stream'
    format = 'txt'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

async def rag_service_sse_proxy_generator(query_text: str, interaction: Interaction):
    """
    Async generator that proxies SSE stream from RAG service.
    
    Args:
        query_text: The user's query text
        interaction: The Interaction model instance
    
    Returns:
        Generator yielding SSE-formatted events
    """
    interaction_id_str = str(interaction.id)
    full_response_text = ""
    error_occurred = False
    last_activity_time = time.time()
    
    logger.info(f"[SSE Proxy {interaction_id_str}] Starting proxy generator for query: '{query_text[:50]}...'")
    rag_service_url = settings.RAG_SERVICE_URL + "/rag_generate_stream"
    logger.info(f"[SSE Proxy {interaction_id_str}] Target RAG service URL: {rag_service_url}")

    # === DEBUGGING: Add explicit start log ===
    logger.info(f"[SSE Proxy {interaction_id_str}] GENERATOR STARTING")

    try:
        # Send initial event with interaction ID
        init_payload = json.dumps({"interaction_id": interaction_id_str})
        logger.debug(f"[SSE Proxy {interaction_id_str}] Yielding init event.")
        yield f"event: init\ndata: {init_payload}\n\n"
        logger.info(f"[SSE Proxy {interaction_id_str}] Init event yielded.") # DEBUG
        last_activity_time = time.time()

        logger.info(f"[SSE Proxy {interaction_id_str}] Attempting to connect to RAG service...")
        async with httpx.AsyncClient(timeout=None) as client:
            logger.info(f"[SSE Proxy {interaction_id_str}] httpx client created. Making POST request...")
            async with client.stream("POST", rag_service_url, json={"query": query_text}) as response:
                logger.info(f"[SSE Proxy {interaction_id_str}] Received response status code: {response.status_code}")
                
                if response.status_code != 200:
                    error_detail = await response.aread()
                    error_msg = f"RAG service returned error {response.status_code}: {error_detail.decode()}"
                    logger.error(f"[SSE Proxy {interaction_id_str}] {error_msg}")
                    interaction.error_message = error_msg
                    error_occurred = True
                    yield f"event: error\ndata: {json.dumps({'error': error_msg, 'interaction_id': interaction_id_str})}\n\n"
                    logger.warning(f"[SSE Proxy {interaction_id_str}] Exiting due to non-200 status from RAG service.")
                    return

                logger.info(f"[SSE Proxy {interaction_id_str}] Starting to iterate over RAG service stream...")
                chunk_count = 0
                # === DEBUGGING: Wrap the loop ===
                try: 
                    async for chunk in response.aiter_text():
                        # Send keep-alive comment if more than 15 seconds since last activity
                        current_time = time.time()
                        if current_time - last_activity_time > 15:
                            logger.debug(f"[SSE Proxy {interaction_id_str}] Sending keep-alive ping")
                            yield f": ping {int(current_time)}\n\n"
                            last_activity_time = current_time
                        
                        chunk_count += 1
                        logger.debug(f"[SSE Proxy {interaction_id_str}] Received raw chunk {chunk_count}") # DEBUG
                        # === DEBUGGING: Log before yield ===
                        logger.debug(f"[SSE Proxy {interaction_id_str}] Yielding chunk {chunk_count}") 
                        yield chunk 
                        # === DEBUGGING: Log after yield ===
                        logger.debug(f"[SSE Proxy {interaction_id_str}] Chunk {chunk_count} yielded successfully")
                        last_activity_time = time.time()
                        
                        try:
                            if chunk.startswith("event: token"):
                                # Correctly split lines using \n (not \\n which is incorrect)
                                lines = chunk.strip().split('\n')
                                logger.debug(f"[SSE Proxy {interaction_id_str}] Token event lines: {lines}")
                                
                                # Check for data part
                                data_line = None
                                for line in lines:
                                    if line.startswith("data:"):
                                        data_line = line
                                        break
                                        
                                if data_line:
                                    data_json = data_line[len("data:"):].strip()
                                    data = json.loads(data_json)
                                    token = data.get('token', '')
                                    full_response_text += token
                                    logger.debug(f"[SSE Proxy {interaction_id_str}] Added token: {token}")
                                    
                            elif chunk.startswith("event: sources"):
                                # Correctly split lines using \n (not \\n which is incorrect)
                                lines = chunk.strip().split('\n')
                                logger.debug(f"[SSE Proxy {interaction_id_str}] Sources event lines: {lines}")
                                
                                # Check for data part
                                data_line = None
                                for line in lines:
                                    if line.startswith("data:"):
                                        data_line = line
                                        break
                                        
                                if data_line:
                                    data_json = data_line[len("data:"):].strip()
                                    data = json.loads(data_json)
                                    sources_list = data.get('sources', [])
                                    if sources_list:
                                        sources_markdown = "\n\n---\n**Sources:**\n" + "\n".join(f"- {s}" for s in sources_list)
                                        full_response_text += sources_markdown
                                        logger.debug(f"[SSE Proxy {interaction_id_str}] Added sources: {sources_list}")
                                        
                            elif chunk.startswith("event: error"):
                                 logger.warning(f"[SSE Proxy {interaction_id_str}] Received 'error' event from RAG stream: {chunk.strip()}")
                                 error_occurred = True
                                 
                            elif chunk.startswith("event: end"):
                                 logger.info(f"[SSE Proxy {interaction_id_str}] Received 'end' event from RAG stream.")
                                 break # Explicitly break loop on end event from RAG service
                        except Exception as parse_err:
                            logger.warning(f"[SSE Proxy {interaction_id_str}] Minor error parsing chunk {chunk_count}: {parse_err}")
                except Exception as loop_err: # DEBUG: Catch errors during iteration
                    logger.exception(f"[SSE Proxy {interaction_id_str}] *** ERROR DURING STREAM ITERATION ***: {loop_err}")
                    raise # Re-raise after logging
                
                logger.info(f"[SSE Proxy {interaction_id_str}] Finished iterating over RAG service stream after {chunk_count} chunks.")

    except httpx.RequestError as e:
        error_msg = f"httpx.RequestError: Could not connect to RAG service at {rag_service_url}: {e}"
        logger.exception(f"[SSE Proxy {interaction_id_str}] {error_msg}") # Use exception for traceback
        interaction.error_message = error_msg
        error_occurred = True
        yield f"event: error\ndata: {json.dumps({'error': 'RAG Service Connection Error', 'detail': str(e), 'interaction_id': interaction_id_str})}\n\n"
        yield f"event: end\ndata: {{}}\n\n" # Ensure end event is sent on error
    except httpx.StreamError as e:
        error_msg = f"httpx.StreamError: Error during streaming from RAG service at {rag_service_url}: {e}"
        logger.exception(f"[SSE Proxy {interaction_id_str}] {error_msg}")
        interaction.error_message = error_msg
        error_occurred = True
        yield f"event: error\ndata: {json.dumps({'error': 'RAG Service Stream Error', 'detail': str(e), 'interaction_id': interaction_id_str})}\n\n"
        yield f"event: end\ndata: {{}}\n\n" # Ensure end event is sent on error
    except Exception as e:
        error_msg = f"Unexpected error during SSE proxy generation: {type(e).__name__}: {e}"
        logger.exception(f"[SSE Proxy {interaction_id_str}] {error_msg}")
        interaction.error_message = error_msg
        error_occurred = True
        yield f"event: error\ndata: {json.dumps({'error': 'Internal Server Error', 'detail': str(e), 'interaction_id': interaction_id_str})}\n\n"
        yield f"event: end\ndata: {{}}\n\n" # Ensure end event is sent on error
    finally:
        logger.info(f"[SSE Proxy {interaction_id_str}] Entering finally block. Error occurred: {error_occurred}")
        if full_response_text and not error_occurred:
            if hasattr(interaction, 'final_response_text'):
                 interaction.final_response_text = full_response_text
                 logger.info(f"[SSE Proxy {interaction_id_str}] Preparing to save captured response text ({len(full_response_text)} chars).")
            else:
                 logger.info(f"[SSE Proxy {interaction_id_str}] Skipping final_response_text assignment for dummy interaction.")
        
        # Only save if it's a real model instance with a save method
        if hasattr(interaction, 'save') and callable(interaction.save):
            interaction_save_async = sync_to_async(interaction.save, thread_sensitive=True)
            try:
                await interaction_save_async()
                logger.info(f"[SSE Proxy {interaction_id_str}] Interaction record saved/updated.")
            except Exception as save_err:
                logger.error(f"[SSE Proxy {interaction_id_str}] Error saving interaction record: {save_err}")
        else:
            logger.info(f"[SSE Proxy {interaction_id_str}] Skipping save for dummy interaction.")
            
        # === FIX: Ensure end event is sent on normal completion ===
        if not error_occurred:
             logger.info(f"[SSE Proxy {interaction_id_str}] Yielding final end event.")
             yield f"event: end\ndata: {{}}\n\n"

        logger.info(f"[SSE Proxy {interaction_id_str}] Proxy generator finished.")

# ============================================================================
# Chat Processing View (Converted to Class-Based Async)
# ============================================================================

# Remove class-level csrf exemption
# @method_decorator(csrf_exempt, name='dispatch') 
class ProcessChatMessageView(View):
    """Async Django view for processing chat messages with Server-Sent Events."""

    @csrf_exempt
    async def get(self, request, *args, **kwargs):
        """Handle GET request with SSE response stream."""
        # Process query parameters
        query_text = request.GET.get('query', '')
        session_id_str = request.GET.get('session_id', '')
        
        # Validate parameters
        if not query_text:
            async def error_gen_msg_req():
                yield 'event: error\ndata: {"error": "Missing required parameter: query"}\n\n'
                yield 'event: end\ndata: {}\n\n'
            return StreamingHttpResponse(
                error_gen_msg_req(),
                content_type='text/event-stream'
            )
        
        # Extract token from Authorization header
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            async def error_gen_auth():
                yield 'event: error\ndata: {"error": "Authentication required"}\n\n'
                yield 'event: end\ndata: {}\n\n'
            return StreamingHttpResponse(
                error_gen_auth(),
                content_type='text/event-stream'
            )
        
        token = auth_header.split(' ')[1]
        
        # Validate the JWT token
        try:
            # Decode and validate the token
            access_token = AccessToken(token)
            user_id = access_token.get('user_id')
            
            if not user_id:
                raise InvalidToken("Token missing user_id claim")
                
            # Get the user object
            user = await sync_to_async(User.objects.get)(id=user_id)
            
        except (InvalidToken, TokenError, User.DoesNotExist) as e:
            async def error_gen_auth_invalid():
                yield f'event: error\ndata: {{"error": "Invalid authentication token: {str(e)}"}}\n\n'
                yield 'event: end\ndata: {}\n\n'
            return StreamingHttpResponse(
                error_gen_auth_invalid(),
                content_type='text/event-stream'
            )
        
        # Check if session_id is provided and valid
        chat_session = None
        if session_id_str and session_id_str != "new":
            try:
                # Validate that the session exists and belongs to the user
                chat_session = await sync_to_async(ChatSession.objects.get)(
                    id=session_id_str, 
                    user=user
                )
            except (ValueError, ChatSession.DoesNotExist):
                # Invalid session ID format or doesn't exist for this user
                pass
        
        # Create a new session if needed
        if not chat_session:
            # Generate a title from the first query
            title = query_text[:30] + ('...' if len(query_text) > 30 else '')
            chat_session = await sync_to_async(ChatSession.objects.create)(
                title=title,
                user=user
            )
        
        # Create a new interaction for this query - Call the method directly since it's already decorated with sync_to_async
        interaction = await self.get_or_create_interaction(
            user, chat_session, query_text
        )
        
        # Return the streaming response
        return StreamingHttpResponse(
            rag_service_sse_proxy_generator(query_text, interaction),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no'  # Disable Nginx buffering
            }
        )
        
    @sync_to_async(thread_sensitive=True)
    def get_or_create_interaction(self, user, chat_session, query):
        """Create a new interaction record."""
        try:
            interaction = Interaction.objects.create(
                user=user,
                chat_session=chat_session,
                query_text=query
            )
            return interaction
        except Exception as e:
            logger.error(f"Failed to create interaction: {e}")
            raise

# We will add Logout view later 