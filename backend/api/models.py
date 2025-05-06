from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.conf import settings # Import settings to get the User model

# Model to store metadata about the source documents
class DocumentMetadata(models.Model):
    filename = models.CharField(max_length=255, unique=True)
    title = models.CharField(max_length=512)
    author = models.CharField(max_length=255, null=True, blank=True)
    publication_year = models.IntegerField(null=True, blank=True)
    publisher = models.CharField(max_length=255, null=True, blank=True)
    document_type = models.CharField(max_length=100, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title or self.filename

# Model to store individual text chunks from documents
class DocumentChunk(models.Model):
    document = models.ForeignKey(DocumentMetadata, related_name='chunks', on_delete=models.CASCADE)
    chunk_index = models.IntegerField()
    content = models.TextField()
    token_count = models.IntegerField()
    chroma_id = models.CharField(max_length=255, unique=True, help_text="Unique ID referencing the vector in ChromaDB") # Assuming Chroma uses string IDs
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Ensure chunk index is unique within a document
        unique_together = ('document', 'chunk_index')
        ordering = ['document', 'chunk_index']

    def __str__(self):
        return f"{self.document.title or self.document.filename} - Chunk {self.chunk_index}"

# Model to represent a single conversation thread
class ChatSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions')
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    title = models.CharField(max_length=255, blank=True, null=True, help_text="Optional title for the chat session")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_time']

    def __str__(self):
        return f"Chat Session {self.id} by {self.user.username} starting {self.start_time.strftime('%Y-%m-%d %H:%M')}"

# Model to log each user query and system response interaction
class Interaction(models.Model):
    chat_session = models.ForeignKey(ChatSession, related_name='interactions', on_delete=models.CASCADE)
    # We can derive user from chat_session, but direct FK might simplify some queries/permissions
    user = models.ForeignKey(User, related_name='interactions', on_delete=models.CASCADE)
    timestamp = models.DateTimeField(default=timezone.now)
    query_text = models.TextField()
    # Store retrieved chunk IDs (from DocumentChunk PKs or chroma_ids)
    retrieved_chunk_ids = models.JSONField(default=list, null=True, blank=True) # Requires PostgreSQL
    combined_context = models.TextField(null=True, blank=True, help_text="The context sent to the LLM")
    llm_response_text = models.TextField(null=True, blank=True, help_text="Raw response from LLM")
    final_response_text = models.TextField(null=True, blank=True, help_text="Response shown to user after processing")
    rag_enabled = models.BooleanField(default=True)
    retrieval_latency_ms = models.IntegerField(null=True, blank=True)
    llm_latency_ms = models.IntegerField(null=True, blank=True)
    total_latency_ms = models.IntegerField(null=True, blank=True)
    # Example: 1 for thumbs up, -1 for thumbs down, 0 for no feedback
    user_feedback_score = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"Interaction in Session {self.chat_session.id} at {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"

# Model to store additional user profile information
class UserProfile(models.Model):
    # Use settings.AUTH_USER_MODEL to correctly reference the User model
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    institution = models.CharField(max_length=255, blank=True, null=True)

    # Define choices for the role field based on the UI dropdown
    class Role(models.TextChoices):
        OBSTETRICIAN = 'OB', 'Obstetrician'
        MIDWIFE = 'MW', 'Midwife'
        NURSE = 'NU', 'Nurse'
        GP = 'GP', 'GP'
        # Add more roles here if needed

    role = models.CharField(
        max_length=2,
        choices=Role.choices,
        blank=True, # Assuming Role might not be strictly required initially
        null=True
    )
    # Add other profile fields here later if needed (e.g., profile_picture_url)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Profile" 