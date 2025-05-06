#!/usr/bin/env python
import sys
import os
import json
from pathlib import Path
import time

# Ensure the project root directory is in the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
# Correct path calculation assuming 'backend' contains 'rag'
backend_dir = os.path.dirname(script_dir) # Goes up to 'rag' directory
project_root = os.path.dirname(backend_dir) # Goes up to 'backend' directory
sys.path.insert(0, project_root)
sys.path.insert(0, backend_dir)

# Update logger import path
try:
    from rag.logger import setup_logger
    logger = setup_logger("verify_processed_docs")
except ImportError:
    import logging
    logger = logging.getLogger("verify_processed_docs")
    logging.basicConfig(level=logging.INFO)

def verify():
    logger.info("Starting verification of processed documents...")
    try:
        # 1. Get list of source .md files
        # Assuming data dir is one level above backend_dir (i.e., project_root/data)
        # Adjust if your data directory is elsewhere (e.g., inside backend/rag/data)
        data_dir = Path(project_root) / 'data' # Example: /Users/user/project/data
        # data_dir = Path(backend_dir) / 'data' # Alt: /Users/user/project/backend/rag/data
        if not data_dir.is_dir():
            logger.error(f"Data directory not found: {data_dir}")
            return
            
        source_files = {f.name for f in data_dir.glob("*.md")}
        num_source_files = len(source_files)
        logger.info(f"Found {num_source_files} .md files in {data_dir}")
        if num_source_files == 0:
             logger.warning("No source .md files found in data directory.")
             # Continue to check JSON, might be empty too

        # 2. Load the JSON output and extract unique source names
        # Base path on backend_dir (points to 'rag')
        json_path = Path(backend_dir) / 'chunks' / 'all_documents_chunks.json'
        if not json_path.exists():
            logger.error(f"Processed chunks JSON file not found: {json_path}")
            return

        logger.info(f"Loading processed chunks from: {json_path}")
        processed_sources = set()
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                all_chunks_data = json.load(f)
            
            if not isinstance(all_chunks_data, list):
                 logger.error(f"JSON file {json_path} does not contain a list.")
                 return

            for chunk in all_chunks_data:
                if isinstance(chunk, dict) and "metadata" in chunk and isinstance(chunk["metadata"], dict) and "source" in chunk["metadata"]:
                    processed_sources.add(chunk["metadata"]["source"])
                else:
                     logger.warning(f"Found chunk with missing or invalid metadata/source field: {chunk}")
            
            num_processed_sources = len(processed_sources)
            logger.info(f"Found {num_processed_sources} unique source filenames mentioned in {json_path}")

        except json.JSONDecodeError as e:
             logger.error(f"Failed to parse JSON file {json_path}: {e}")
             return
        except Exception as e:
             logger.error(f"Failed to read or process JSON file {json_path}: {e}")
             return
             
        # 3. Compare the sets
        if source_files == processed_sources:
            logger.info("[SUCCESS] The set of source files in the data directory matches the set of processed sources found in the JSON output.")
        else:
            logger.warning("[MISMATCH] The source files and processed files do not match perfectly.")
            
            missing_in_json = source_files - processed_sources
            if missing_in_json:
                logger.warning(f"Files found in '{data_dir}' but MISSING from '{json_path}': {missing_in_json}")
            
            extra_in_json = processed_sources - source_files
            if extra_in_json:
                logger.warning(f"Files found in '{json_path}' but NOT FOUND in '{data_dir}': {extra_in_json}")

    except Exception as e:
        logger.exception(f"An error occurred during verification: {e}")

if __name__ == "__main__":
    verify() 