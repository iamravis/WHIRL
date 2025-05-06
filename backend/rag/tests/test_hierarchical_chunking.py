#!/usr/bin/env python
import sys
import os
import json
from pathlib import Path

# Ensure the project root directory (containing rag_core_advanced) is in the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
rag_core_advanced_dir = os.path.dirname(script_dir) # Go up one level from tests/
project_root = os.path.dirname(rag_core_advanced_dir) # Go up one level from rag_core_advanced/
sys.path.insert(0, project_root)

# Now import from rag_core_advanced (relative imports won't work easily for a script)
from rag_core_advanced.embeddings import DocumentProcessor
from rag_core_advanced.config import Config
from rag_core_advanced.logger import setup_logger

logger = setup_logger("test_chunking")

def run_test():
    logger.info("Starting hierarchical chunking test (for table evaluation)...")
    try:
        config = Config()
        # Point to the correct data directory relative to the project root
        # Config already makes data_dir absolute, but let's ensure it's correct
        data_dir = Path(project_root) / 'data'
        if not data_dir.is_dir():
             logger.error(f"Data directory not found at: {data_dir}")
             # Try the config default path as a fallback
             data_dir = config.data_dir
             if not data_dir.is_dir():
                  logger.error(f"Config data directory also not found: {config.data_dir}")
                  return

        # Use the specific document for table testing
        test_doc_name = "Amniocentesis and chorionic villus sampling (Green-top Guideline No 8).md"
        doc_path = data_dir / test_doc_name

        if not doc_path.exists():
            logger.error(f"Test document not found: {doc_path}")
            return

        logger.info(f"Processing document: {doc_path}")

        # Initialize processor (will initialize embeddings, may take time/GPU RAM)
        # For chunking test only, we don't strictly need embeddings, but init loads them
        # Consider adding a mode to DocumentProcessor init to skip embedding loading for tests?
        # For now, let it load.
        doc_processor = DocumentProcessor(config)

        # Process the single document
        chunks = doc_processor.process_markdown_document(str(doc_path)) # Convert Path to string

        logger.info(f"Generated {len(chunks)} chunks.")

        # Prepare output data
        output_data = []
        for i, chunk in enumerate(chunks):
            output_data.append({
                "chunk_index": i,
                "page_content": chunk.page_content,
                "metadata": chunk.metadata
            })

        # Define output path
        output_dir = Path(rag_core_advanced_dir) / 'chunks'
        output_dir.mkdir(parents=True, exist_ok=True) # Ensure chunks dir exists
        # Update output filename
        output_filename = f"{test_doc_name.replace('.md', '_TABLE_TEST_chunks.json')}"
        output_path = output_dir / output_filename

        logger.info(f"Saving chunk output to: {output_path}")

        # Save to JSON
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=4, ensure_ascii=False)

        logger.info("Chunking test (for table evaluation) completed successfully.")

    except ImportError as e:
        logger.error(f"Import Error: {e}. Make sure you are running this script from the project root or have set PYTHONPATH correctly.")
        logger.error(f"Current sys.path: {sys.path}")
    except Exception as e:
        logger.exception(f"An error occurred during the test: {e}")

if __name__ == "__main__":
    run_test() 