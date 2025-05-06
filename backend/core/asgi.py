"""
ASGI config for core project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

application = get_asgi_application()

# Replace with:

import os
from django.core.asgi import get_asgi_application

# Set Django settings module path
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Get the Django ASGI application
django_application = get_asgi_application()

# Create a custom middleware to handle SSE connections
async def sse_friendly_middleware(scope, receive, send):
    """
    Custom middleware to handle Server-Sent Events properly.
    Ensures hop-by-hop headers aren't included in responses.
    """
    if scope["type"] == "http":
        # Check if this is an SSE request (text/event-stream)
        headers = dict(scope.get("headers", []))
        accept_header = headers.get(b"accept", b"").decode("latin1", errors="replace")
        
        # Modified send function to filter out problematic headers
        async def modified_send(message):
            if message["type"] == "http.response.start":
                # Clean up hop-by-hop headers that cause problems with ASGI
                headers = message.get("headers", [])
                filtered_headers = [
                    header for header in headers 
                    if header[0].lower() not in [
                        b'connection',
                        b'keep-alive',
                        b'proxy-authenticate',
                        b'proxy-authorization',
                        b'te',
                        b'trailers',
                        b'transfer-encoding',
                        b'upgrade',
                    ]
                ]
                message["headers"] = filtered_headers
            
            # Send the modified message
            await send(message)
        
        # Process with Django application using modified send
        await django_application(scope, receive, modified_send)
    else:
        # Default to standard Django ASGI for non-HTTP requests
        await django_application(scope, receive, send)

# Use the custom middleware as the main application
application = sse_friendly_middleware
