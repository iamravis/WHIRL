#!/usr/bin/env python
import sys
import os
import json
from pathlib import Path
import time

# --- Path Setup --- 
# Absolute path to this script
script_path = Path(__file__).resolve()
# Path to the 'scripts' directory
scripts_dir = script_path.parent 
# Path to the 'rag' directory (one level up from scripts)
rag_dir = scripts_dir.parent
# Path to the 'backend' directory (one level up from rag)
backend_dir = rag_dir.parent
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
except Exception as e:
    print(f"Error during django.setup(): {e}")
    print("Please ensure your Django settings are configured correctly.")
    sys.exit(1)
# --- End Django Setup ---

# Imports after path and Django setup
from django.conf import settings # May need settings if DP uses them internally
from langchain.schema import Document # Keep this for reconstructing documents
from rag.embeddings import DocumentProcessor

# Use standard logging
import logging
logger = logging.getLogger("populate_database")
logging.basicConfig(level=logging.INFO)

def populate():
    logger.info("Starting database population...")
    start_time = time.time()

    try:
        # Config removed in previous step

        # --- Define path for the NEW database --- 
        # REMOVE HARDCODED PATH AND OVERRIDE
        # new_db_dir = Path(backend_dir) / 'chroma_db_advanced' 
        # new_db_dir_str = str(new_db_dir)
        # logger.info(f"Target database directory: {new_db_dir_str}")

        # --- Load processed chunks from JSON --- 
        # Use rag_dir for the correct path
        chunks_json_path = Path(rag_dir) / 'chunks' / 'all_documents_chunks.json'
        if not chunks_json_path.exists():
            logger.error(f"Processed chunks JSON file not found: {chunks_json_path}")
            logger.error("Please ensure process_all_docs.py has run AND you moved the output file to backend/rag/chunks/")
            return

        logger.info(f"Loading processed chunks from: {chunks_json_path}")
        documents_to_add = []
        try:
            with open(chunks_json_path, 'r', encoding='utf-8') as f:
                all_chunks_data = json.load(f)
            
            if not isinstance(all_chunks_data, list):
                 logger.error(f"JSON file {chunks_json_path} does not contain a list.")
                 return

            # Reconstruct Langchain Document objects
            for chunk_data in all_chunks_data:
                 if isinstance(chunk_data, dict) and "page_content" in chunk_data and "metadata" in chunk_data:
                      documents_to_add.append(Document(
                           page_content=chunk_data["page_content"],
                           metadata=chunk_data["metadata"]
                      ))
                 else:
                      logger.warning(f"Skipping invalid chunk data structure in JSON: {chunk_data}")
            
            logger.info(f"Successfully loaded {len(documents_to_add)} document chunks from JSON.")

        except json.JSONDecodeError as e:
             logger.error(f"Failed to parse JSON file {chunks_json_path}: {e}")
             return
        except Exception as e:
             logger.error(f"Failed to read or process JSON file {chunks_json_path}: {e}")
             return
        
        if not documents_to_add:
             logger.warning("No documents loaded from JSON. Cannot populate database.")
             return

        # --- Initialize DocumentProcessor --- 
        logger.info("Initializing DocumentProcessor...")
        # Initialize without arguments (reads settings internally)
        doc_processor = DocumentProcessor()
        # Verify the path DocumentProcessor will use (from settings)
        logger.info(f"DocumentProcessor will use vectorstore path from settings: {doc_processor.chroma_dir}")

        # REMOVE OVERRIDE - Let DocumentProcessor use its internally set chroma_dir
        # doc_processor.chroma_dir = new_db_dir_str 
        # logger.info(f"DocumentProcessor chroma_dir OVERRIDDEN to: {doc_processor.chroma_dir}")

        # This step will load the embedding model and populate the DB
        # It will use the batching logic defined in update_vectorstore
        logger.info(f"Calling update_vectorstore to populate ChromaDB at {doc_processor.chroma_dir}...")
        vectorstore = doc_processor.update_vectorstore(documents_to_add)

        if vectorstore:
             logger.info("Database population completed successfully.")
             # Optional: verify count? vectorstore.count() might not be reliable immediately after persist?
             # count = vectorstore._collection.count()
             # logger.info(f"Verification: Database collection '{vectorstore._collection.name}' now contains {count} entries.")
        else:
             logger.error("Database population failed. update_vectorstore returned None.")

    except Exception as e:
        logger.exception(f"A critical error occurred during database population: {e}")
    finally:
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"Database population run finished in {duration:.2f} seconds.")

if __name__ == "__main__":
    populate() 