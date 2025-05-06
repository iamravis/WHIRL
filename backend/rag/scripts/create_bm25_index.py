#!/usr/bin/env python
import sys
import os
import json
import pickle
from pathlib import Path
import time
from rank_bm25 import BM25Okapi
import re

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

# Add project root and backend directory to Python path (needed for potential logger import)
sys.path.insert(0, str(project_root)) 
sys.path.insert(0, str(backend_dir))
# --- End Path Setup ---

# Update logger import (optional, using standard logging as fallback)
try:
    # If you have a central logger setup in rag.logger
    # from rag.logger import setup_logger 
    # logger = setup_logger("create_bm25_index")
    # Using standard logging for now
    import logging
    logger = logging.getLogger("create_bm25_index")
    logging.basicConfig(level=logging.INFO)
except ImportError:
    import logging
    logger = logging.getLogger("create_bm25_index")
    logging.basicConfig(level=logging.INFO)

def simple_tokenizer(text):
    """A basic tokenizer: lowercase and split by non-alphanumeric characters."""
    text = text.lower()
    tokens = re.split(r'\W+', text) # Split by one or more non-alphanumeric
    return [token for token in tokens if token] # Remove empty strings

def create_index():
    logger.info("Starting BM25 index creation...")
    start_time = time.time()

    try:
        # --- Define paths --- 
        chunks_json_path = Path(rag_dir) / 'chunks' / 'all_documents_chunks.json'
        index_dir = Path(rag_dir) / 'indexes'
        index_file_path = index_dir / 'bm25_index.pkl'

        # Create index directory if it doesn't exist
        index_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Index will be saved to: {index_file_path}")

        # --- Load corpus text from JSON --- 
        if not chunks_json_path.exists():
            logger.error(f"Processed chunks JSON file not found: {chunks_json_path}")
            logger.error("Please ensure process_all_docs.py has been run successfully and the output JSON is in backend/rag/chunks/.")
            return

        logger.info(f"Loading corpus text from: {chunks_json_path}")
        corpus_texts = []
        corpus_metadata_ref = [] # Store metadata (e.g., chunk ID or source) for later reference if needed
        try:
            with open(chunks_json_path, 'r', encoding='utf-8') as f:
                all_chunks_data = json.load(f)
            
            if not isinstance(all_chunks_data, list):
                 logger.error(f"JSON file {chunks_json_path} does not contain a list.")
                 return

            for i, chunk_data in enumerate(all_chunks_data):
                 if isinstance(chunk_data, dict) and "page_content" in chunk_data:
                      corpus_texts.append(chunk_data["page_content"])
                      # Store index or a unique identifier if available in metadata
                      metadata_info = chunk_data.get("metadata", {})
                      corpus_metadata_ref.append({
                          "original_index": i,
                          "source": metadata_info.get("source", "unknown"),
                          "section": metadata_info.get("section", "unknown"),
                          "type": metadata_info.get("type", "unknown")
                          # Add other relevant metadata if needed
                      })
                 else:
                      logger.warning(f"Skipping invalid chunk data structure at index {i} in JSON: {chunk_data}")
            
            logger.info(f"Successfully loaded {len(corpus_texts)} document texts for the corpus.")

        except json.JSONDecodeError as e:
             logger.error(f"Failed to parse JSON file {chunks_json_path}: {e}")
             return
        except Exception as e:
             logger.error(f"Failed to read or process JSON file {chunks_json_path}: {e}")
             return
        
        if not corpus_texts:
             logger.warning("No text content loaded from JSON. Cannot create index.")
             return

        # --- Tokenize the corpus --- 
        logger.info("Tokenizing corpus...")
        tokenized_corpus = [simple_tokenizer(doc) for doc in corpus_texts]
        logger.info(f"Tokenization complete. Example tokens from first doc: {tokenized_corpus[0][:10]}...")

        # --- Build the BM25 index --- 
        logger.info("Building BM25 index (this may take a moment)...")
        bm25 = BM25Okapi(tokenized_corpus)
        logger.info("BM25 index built successfully.")

        # --- Save the index and metadata reference to file --- 
        logger.info(f"Saving BM25 index and metadata reference to {index_file_path}...")
        # Save both the index and the metadata reference list together
        index_data = {
            "bm25_index": bm25,
            "metadata_ref": corpus_metadata_ref
        }
        with open(index_file_path, 'wb') as f_out:
            pickle.dump(index_data, f_out)
        logger.info("Index and metadata reference saved successfully.")

    except Exception as e:
        logger.exception(f"A critical error occurred during BM25 index creation: {e}")
    finally:
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"BM25 index creation run finished in {duration:.2f} seconds.")

if __name__ == "__main__":
    create_index() 