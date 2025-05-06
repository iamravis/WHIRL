import os
from pathlib import Path
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import torch

# Use advanced components
from rag_core_advanced.config import Config
# Remove DocumentProcessor import as we won't process on startup
# from .embeddings import DocumentProcessor 
# Remove process_query import, keep RAGBot and simple_tokenizer
from rag_core_advanced.rag import RAGBot, simple_tokenizer 
from rag_core_advanced.logger import setup_logger

# Add imports needed for loading ChromaDB
from langchain_community.vectorstores import Chroma
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
# Add StreamingResponse
from fastapi.responses import StreamingResponse

logger = setup_logger("gpu_inference")

app = FastAPI(
    title="RAG GPU Inference Service",
    description="GPU-accelerated RAG pipeline for document QA",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://129.67.4.204:8080"],  # Use exact frontend IP
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

class Query(BaseModel):
    """
    Request model for user queries.
    'question' is the user's input for the RAG system.
    'reset_chat' indicates whether to start a new session with no prior context.
    """
    question: str = Field(..., description="User question for the RAG system")
    reset_chat: bool = Field(False, description="Set True to start a new chat session with no previous context")

class Response(BaseModel):
    """
    Response model for RAG answers.
    'answer' is the textual reply,
    'sources' contains references to documents or chunks used,
    and 'metadata' can contain any additional information.
    """
    answer: str
    sources: list[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)

# Global variable for RAGBot instance
rag_bot = None

@app.on_event("startup")
async def startup_event():
    """
    Initialize RAG components on startup.
    Loads pre-built vector store and BM25 index, and sets up the RAGBot.
    Assumes artifacts (ChromaDB, BM25 index, chunks JSON) exist.
    """
    global rag_bot
    try:
        # Load the configuration
        config = Config()
        logger.info("Starting RAG system initialization (using pre-built artifacts)")

        # --- Remove Document Processing on Startup --- 
        # doc_processor = DocumentProcessor(config)
        # md_files = list(Path(config.data_dir).glob("*.md"))
        # documents = doc_processor.load_and_process_documents(md_files)
        # vectorstore = doc_processor.update_vectorstore(documents)

        # --- Initialize RAGBot (loads BM25 index + all docs ref) --- 
        logger.info("Initializing RAGBot (loads BM25 index and document references)...")
        # Ensure RAGBot is imported from rag_core_advanced
        rag_bot = RAGBot(config) 

        # --- Load the Pre-built Vector Store --- 
        logger.info(f"Loading embedding model for ChromaDB: {config.embedding_model}")
        # Ensure consistent device usage, check config or default to cuda:0 if available
        device = "cuda:0" if torch.cuda.is_available() else "cpu" 
        embedding_function = HuggingFaceEmbeddings(
            model_name=config.embedding_model,
            model_kwargs={"device": device}
        )
        
        vectorstore_path = str(Path(__file__).parent / 'chroma_db_advanced') # Path relative to this script
        collection_name = config.collection_name 
        logger.info(f"Connecting to existing ChromaDB vector store at: {vectorstore_path}")
        logger.info(f"Using collection name: {collection_name}")

        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=embedding_function,
            persist_directory=vectorstore_path
        )
        
        # Assign the loaded vector store to the RAGBot instance
        rag_bot.vectorstore = vectorstore
        if not rag_bot.vectorstore:
             raise ValueError("Vectorstore loading failed or not assigned.")
        logger.info("Pre-built vector store loaded and assigned to RAGBot.")
        # --- End Load Vector Store ---

        logger.info("GPU Inference service initialized successfully with advanced RAG components.")
    except Exception as e:
        logger.error(f"Startup failed: {str(e)}")
        raise RuntimeError(f"Service initialization failed: {str(e)}")

@app.get("/")
async def root():
    """
    Health check endpoint.
    Returns a basic JSON indicating the service is healthy.
    """
    return {"status": "healthy", "service": "RAG GPU Inference"}

@app.post("/infer", response_model=Response)
async def process_inference(query: Query):
    """
    Process a RAG query using the advanced RAG pipeline and return the generated response.
    If reset_chat=True, any previous conversation context is discarded.
    """
    try:
        if not rag_bot:
            raise HTTPException(
                status_code=503,
                detail="RAG service not initialized"
            )

        # If the user wants a new chat session, reset conversation history
        if query.reset_chat:
            logger.info("Resetting conversation history for new session.")
            rag_bot.conversation_history = []

        # --- Perform Retrieval and Generation directly --- 
        logger.info(f"Processing non-streaming query: {query.question}")
        
        # Step 1: Retrieve documents
        retrieved_docs = rag_bot.retrieve_documents(query.question)
        if not retrieved_docs:
             logger.warning("Non-streaming - No documents retrieved.")
             # Return a specific message if no docs found
             return Response(answer="Could not find relevant information to answer the question.", sources=[], metadata={})

        # Step 2: Generate response using retrieved documents
        response_data = rag_bot.generate_response(query.question, retrieved_docs)
        final_answer = response_data.get("generation", "Could not generate an answer.")
        # --- End Retrieval and Generation ---
        
        # Since generate_response now includes sources, we extract them differently
        answer_part = final_answer
        sources_list = []
        sources_marker = "\n\n---\n**Sources:**\n"
        if sources_marker in final_answer:
            parts = final_answer.split(sources_marker, 1)
            answer_part = parts[0]
            sources_raw = parts[1].split('\n')
            sources_list = [s[2:] for s in sources_raw if s.startswith("- ")] # Remove leading "- "
            
        logger.info(f"Returning answer and {len(sources_list)} sources.")
        
        # Return the answer, plus parsed sources
        return Response(
            answer=answer_part, # Return only the answer part here
            sources=sources_list, # Return parsed source list
            metadata={} # Return empty metadata dict
        )
    except Exception as e:
        logger.error(f"Query processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Streaming Endpoint --- 
async def stream_generator(rag_bot_instance: RAGBot, query: Query):
    """Helper async generator function to handle retrieval and streaming generation."""
    try:
        if not rag_bot_instance:
            yield "Error: RAG service not initialized."
            return

        if query.reset_chat:
            logger.info("Resetting conversation history for new streaming session.")
            rag_bot_instance.conversation_history = []
            
        # Step 1: Retrieve documents
        logger.info(f"Streaming - Retrieving documents for: {query.question}")
        retrieved_docs = rag_bot_instance.retrieve_documents(query.question)
        if not retrieved_docs:
             logger.warning("Streaming - No documents retrieved.")
             # Yield a message indicating no documents found
             yield "Could not find relevant information to answer the question based on available documents."
             return

        # Step 2: Stream the response using the generator method
        logger.info("Streaming - Starting generation stream...")
        async for chunk in rag_bot_instance.generate_response_stream(query.question, retrieved_docs):
            yield chunk
            
        logger.info("Streaming - Stream finished.")
            
    except Exception as e:
        logger.error(f"Streaming generation failed: {e}")
        yield f"\n\n[Error during streaming: {e}]"

@app.post("/infer_stream")
async def process_inference_stream(query: Query):
    """
    Process a RAG query and stream the response token by token.
    If reset_chat=True, any previous conversation context is discarded.
    """
    logger.info(f"Received streaming request for query: {query.question}")
    # Return a StreamingResponse that uses the async generator
    return StreamingResponse(stream_generator(rag_bot, query), media_type="text/plain")
# --- End Streaming Endpoint ---

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)



