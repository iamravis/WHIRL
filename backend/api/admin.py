from django.contrib import admin
# Import User if you want to customize its admin representation (optional but common)
# from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

# Import your custom models
from .models import DocumentMetadata, DocumentChunk, ChatSession, Interaction, UserProfile

# Register your models here so they appear in the Django admin interface.

# Basic registration (shows default representation)
admin.site.register(DocumentMetadata)
admin.site.register(DocumentChunk)
admin.site.register(ChatSession)
admin.site.register(Interaction)
admin.site.register(UserProfile)

# If you need to customize how models appear or behave in the admin,
# you would create ModelAdmin subclasses and register them like this:
# class InteractionAdmin(admin.ModelAdmin):
#     list_display = ('chat_session', 'user', 'timestamp', 'query_text', 'rag_enabled')
#     list_filter = ('rag_enabled', 'user', 'timestamp')
#     search_fields = ('query_text', 'final_response_text', 'user__username')
# admin.site.register(Interaction, InteractionAdmin) 