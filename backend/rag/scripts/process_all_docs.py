#!/usr/bin/env python
import sys
import os
import json
from pathlib import Path
import time
import hashlib

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
# This ensures Python can find 'backend' and then 'backend.rag'
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
    print("Please ensure your Django settings are configured correctly and migrations are applied.")
    sys.exit(1)
# --- End Django Setup ---

# Now imports should work relative to the backend directory
from django.conf import settings
from rag.embeddings import DocumentProcessor, read_markdown_file
# Remove Config import
# from rag.config import Config 

# Use standard logging for standalone script
import logging
logger = logging.getLogger("process_all_docs")
logging.basicConfig(level=logging.INFO)

def process_docs():
    logger.info("Starting processing of all documents...")
    start_time = time.time()
    all_generated_chunks = []
    processed_count = 0
    num_chunks = 0

    try:
        # Remove Config instantiation
        # config = Config()
        # Get data_dir from Django settings
        data_dir = Path(settings.RAG_DATA_DIR)
        if not data_dir.is_dir():
            logger.error(f"Data directory from settings not found: {data_dir}")
            return

        # Initialize DocumentProcessor without config
        doc_processor = DocumentProcessor()

        md_files = list(data_dir.glob("*.md"))
        md_count = len(md_files)
        if md_count == 0:
            logger.warning(f"No Markdown files found in {data_dir}.")
            return
        logger.info(f"Found {md_count} total Markdown files in {data_dir}.")

        # --- Integrate file checking logic here --- 
        processed_files_info = doc_processor.get_processed_files()
        logger.info(f"Found {len(processed_files_info)} files previously processed according to stored hashes.")
        files_to_process_paths = []
        for file_path_obj in md_files:
             file_path = str(file_path_obj)
             filename = os.path.basename(file_path)
             try:
                 current_content = read_markdown_file(file_path) # Need to import this function
                 current_hash = hashlib.sha256(current_content.encode('utf-8')).hexdigest()
                 stored_hash = processed_files_info.get(filename)
                 if stored_hash is None or stored_hash != current_hash:
                     files_to_process_paths.append(file_path)
                 # else: logger.debug(f"Skipping unchanged file: {filename}") # Optional: too verbose?
             except Exception as e:
                  logger.error(f"Error checking hash for file {filename}: {e}. Skipping check.")
                  # Decide: should we process if checking fails? Assume yes for now.
                  files_to_process_paths.append(file_path)
        # --------------------------------------

        total_files_to_process = len(files_to_process_paths)
        if total_files_to_process == 0:
            logger.info("No new or updated documents to process based on hash checks.")
            return
        logger.info(f"Identified {total_files_to_process} files requiring processing (new or updated)." )

        # --- Processing Loop --- 
        batch_size = doc_processor.batch_size # Get batch size from processor
        for i in range(0, total_files_to_process, batch_size):
            batch_paths = files_to_process_paths[i:i+batch_size]
            current_batch_num = i // batch_size + 1
            total_batches = (total_files_to_process + batch_size - 1) // batch_size
            logger.info(f"--- Starting processing batch {current_batch_num}/{total_batches} --- ")
            
            for file_path in batch_paths:
                processed_count += 1
                filename = os.path.basename(file_path)
                logger.info(f"Processing file {processed_count}/{total_files_to_process}: {filename}")
                try:
                    chunks = doc_processor.process_markdown_document(file_path)
                    all_generated_chunks.extend(chunks)
                    logger.debug(f"Successfully processed {filename}, added {len(chunks)} chunks.")
                except Exception as e:
                    logger.exception(f"FAILED processing document {filename} (file {processed_count}/{total_files_to_process}). Skipping file.")
                    # Skip this file, continue with the next in the batch
                    continue 
            logger.info(f"--- Finished processing batch {current_batch_num}/{total_batches} --- ")
        # ------------------------

        num_chunks = len(all_generated_chunks)
        logger.info(f"Processing complete. Generated/updated a total of {num_chunks} chunks from {processed_count} attempted files.")

        # --- Optional: Save output --- 
        # ...(existing save logic)... using all_generated_chunks
        save_output = True 
        if save_output and all_generated_chunks:
             # Use rag_dir instead of backend_dir for the correct path
             output_dir = Path(rag_dir) / 'chunks'
             output_dir.mkdir(parents=True, exist_ok=True)
             output_filename = "all_documents_chunks.json"
             output_path = output_dir / output_filename
             logger.info(f"Saving all {num_chunks} generated chunks to: {output_path}")
             output_data = []
             for idx, chunk in enumerate(all_generated_chunks):
                 # Ensure metadata is serializable (convert dict values if needed)
                 serializable_metadata = {k: str(v) if isinstance(v, (list, dict, set)) else v 
                                         for k, v in chunk.metadata.items()}
                 output_data.append({"chunk_index": idx, 
                                      "page_content": chunk.page_content, 
                                      "metadata": serializable_metadata})
             try:
                 with open(output_path, 'w', encoding='utf-8') as f:
                     json.dump(output_data, f, indent=2, ensure_ascii=False)
                 logger.info("Successfully saved chunk output.")
             except Exception as e:
                  logger.error(f"Failed to save chunk output to {output_path}: {e}")
        elif not all_generated_chunks and total_files_to_process > 0:
             logger.warning("Processed files but generated 0 chunks (all might have failed?). Check logs.")
        elif total_files_to_process == 0:
            pass # Already logged no files to process
        # -------------------------

    except Exception as e:
        logger.exception(f"A critical error occurred during the overall processing run: {e}")
    finally:
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"Processing run finished in {duration:.2f} seconds.")

if __name__ == "__main__":
    process_docs() 