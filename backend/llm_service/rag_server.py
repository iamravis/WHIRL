import os
import sys # Added for path manipulation
from pathlib import Path
import logging
# import httpx  # Removed - RAGBot handles LLM interaction
from typing import AsyncGenerator
import json

from fastapi import FastAPI, HTTPException # Removed Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
# import torch # Removed - Handled within RAGBot
# from langchain_community.vectorstores import Chroma # Removed - Handled within RAGBot
# from langchain_huggingface.embeddings import HuggingFaceEmbeddings # Removed - Handled within RAGBot
# from dotenv import load_dotenv # Removed - RAGBot uses Django settings

# --- Path Setup --- 
# Absolute path to this script
script_path = Path(__file__).resolve()
# Path to the 'llm_service' directory
llm_service_dir = script_path.parent 
# Path to the 'backend' directory (one level up from llm_service)
backend_dir = llm_service_dir.parent
# Path to the project root (one level up from backend)
project_root = backend_dir.parent

# Add project root and backend directory to Python path
sys.path.insert(0, str(project_root)) 
sys.path.insert(0, str(backend_dir))
# --- End Path Setup ---

# --- Django Setup --- 
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.core.settings') 
import django
try:
    django.setup()
    # Now we can import Django settings and our RAGBot
    from django.conf import settings
    from rag.rag import RAGBot
except Exception as e:
    print(f"CRITICAL: Error during Django setup or importing RAGBot: {e}")
    print("Ensure Django settings are correct and the rag app is available.")
    # Optionally sys.exit(1) here if server cannot run without Django/RAGBot
    RAGBot = None # Set RAGBot to None if import fails
# --- End Django Setup ---

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- FastAPI App Initialization ---
app = FastAPI(
    title="RAG Service Wrapper",
    description="Wraps the RAGBot class for API access.",
    version="1.1.0"
)

# --- CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Restrict in production
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# --- Global RAGBot Instance ---
rag_bot_instance: RAGBot | None = None

# --- Pydantic Models ---
class RagQuery(BaseModel):
    """Request model for RAG queries."""
    query: str = Field(..., description="User query for the RAG system")
    # Removed other fields, add conversation_history if needed

# Removed RagStreamResponse model - not strictly needed

# Removed get_http_client dependency

# --- Startup Event ---
@app.on_event("startup")
async def startup_event():
    """Initialize RAGBot instance on startup."""
    global rag_bot_instance
    logger.info("Executing RAG service startup event...")
    if RAGBot is None:
        logger.error("RAGBot class could not be imported due to setup errors. Service may not function.")
        # Decide if server should fail hard here? 
        # raise RuntimeError("RAGBot failed to load.")
        return
        
    if rag_bot_instance is None:
        try:
            logger.info("Initializing RAGBot instance...")
            rag_bot_instance = RAGBot() # RAGBot reads settings internally
            logger.info("RAGBot instance initialized successfully.")
            # Optional: Load models eagerly if desired, though RAGBot does lazy loading
            # logger.info("Pre-loading RAGBot components...")
            # rag_bot_instance._load_vector_store() # RAGBot.__init__ does this
            # rag_bot_instance._load_bm25_and_docs() # RAGBot.__init__ does this
            # rag_bot_instance.load_reranker_model() # Optional pre-loading
            # logger.info("RAGBot components pre-loaded.")
        except Exception as e:
            logger.exception(f"Failed to initialize RAGBot during startup: {e}")
            rag_bot_instance = None # Ensure it's None if init fails
            # Depending on severity, might want to raise to prevent server running
            # raise RuntimeError(f"RAGBot failed to initialize: {e}")
    else:
        logger.info("RAGBot instance already initialized.")

# --- Shutdown Event --- (No changes needed)
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down RAG service...")
    # Add any specific cleanup for rag_bot_instance if needed
    logger.info("RAG service shut down.")

# Removed assemble_prompt - Handled by RAGBot

# --- Streaming Generator Wrapper ---
async def rag_bot_stream_generator(query: str) -> AsyncGenerator[str, None]:
    """Streams response from the RAGBot instance."""
    global rag_bot_instance
    if rag_bot_instance is None:
        logger.error("RAGBot instance is not available.")
        yield "[Error: RAG Service not initialized properly.]\n"
        return

    try:
        # 1. Retrieve documents using RAGBot (synchronous)
        # Run sync function in threadpool to avoid blocking event loop
        # Note: Consider making RAGBot.retrieve_documents async in the future
        logger.info(f"Retrieving documents for query: '{query[:50]}...'")
        # retrieved_docs = await asyncio.to_thread(rag_bot_instance.retrieve_documents, query)
        # --- Simpler approach: Call sync directly, FastAPI handles threadpool --- 
        retrieved_docs = rag_bot_instance.retrieve_documents(query)
        logger.info(f"Retrieved {len(retrieved_docs)} documents via RAGBot.")

        # 2. Stream the response using RAGBot (already async)
        logger.info("Starting response stream from RAGBot...")
        async for chunk in rag_bot_instance.generate_response_stream(query, retrieved_docs):
            yield chunk
        logger.info("Finished streaming response from RAGBot.")

    except Exception as e:
        logger.exception(f"Error during RAGBot streaming generation: {e}")
        yield f"[Error during RAG processing: {e.__class__.__name__}]\n"


# --- API Endpoint ---
@app.post("/rag_generate_stream")
async def generate_rag_response_stream(payload: RagQuery):
    """
    Endpoint to process a RAG query using RAGBot and stream the response.
    Returns a Server-Sent Events (SSE) stream.
    """
    logger.info(f"Received RAG streaming request via RAGBot for query: '{payload.query[:50]}...'")
    
    # Check if RAGBot initialized correctly
    if rag_bot_instance is None:
        # You could return a static error response here if needed
        # raise HTTPException(status_code=503, detail="RAG Service not initialized")
        # Or yield an error event from a simple generator
        async def error_gen():
            err_payload = json.dumps({"error": "RAG Service not initialized properly."})
            yield f"event: error\ndata: {err_payload}\n\n"
            yield f"event: end\ndata: {{}}\n\n"
        return StreamingResponse(error_gen(), media_type="text/event-stream")
        
    # Use the RAGBot's generator function which now yields SSE
    return StreamingResponse(
        rag_bot_instance.generate_response_stream(payload.query, []), # Pass empty list for docs initially, RAGBot retrieves them
        media_type="text/event-stream" # Set correct media type for SSE
    )

# --- Health Check Endpoint --- (No changes needed)
@app.get("/health")
async def health_check():
    """Basic health check."""
    # Could add checks for vectorstore connection etc. if needed
    return {"status": "healthy", "service": "RAG Service"}

# --- Main Execution --- (No changes needed)
if __name__ == "__main__":
    import uvicorn
    # Default port 8002 to avoid conflict with llm_server (default 8001) and Django (default 8000)
    port = int(os.getenv("RAG_SERVICE_PORT", "8001"))
    host = os.getenv("RAG_SERVICE_HOST", "0.0.0.0")
    logger.info(f"Starting RAG service on {host}:{port}")
    uvicorn.run(app, host=host, port=port) 