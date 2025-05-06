import logging
from django.apps import AppConfig
from django.conf import settings

# Configure logging for this module
logger = logging.getLogger(__name__)

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        """Called when Django starts."""
        # This method should generally be used for app-specific setup like 
        # connecting signals, but NOT for initializing heavy external services
        # or singletons like RAGBot which now run in a separate process.
        
        # Example: Check if required settings are present
        # if not hasattr(settings, 'RAG_SERVICE_URL') or not settings.RAG_SERVICE_URL:
        #     logger.warning("settings.RAG_SERVICE_URL is not configured. Chat functionality might fail.")
            
        logger.info("API AppConfig ready.")
        # REMOVED all RAGBot initialization logic from here.

# REMOVED helper function get_rag_bot() 