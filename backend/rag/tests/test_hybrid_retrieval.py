#!/usr/bin/env python
import sys
import os
import time
from pathlib import Path

# Ensure the project root directory is in the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
rag_core_advanced_dir = os.path.dirname(script_dir)
project_root = os.path.dirname(rag_core_advanced_dir)
sys.path.insert(0, project_root)

from langchain_community.vectorstores import Chroma
from langchain_huggingface.embeddings import HuggingFaceEmbeddings

from rag_core_advanced.config import Config
from rag_core_advanced.rag import RAGBot
from rag_core_advanced.logger import setup_logger

logger = setup_logger("test_e2e_rag")

def test_e2e_rag():
    logger.info("--- Starting End-to-End RAG Test --- ")
    start_time = time.time()

    try:
        # --- Initialize Config and RAGBot --- 
        logger.info("Initializing configuration...")
        config = Config()
        
        logger.info("Initializing RAGBot (will load BM25 index and documents)...")
        rag_bot = RAGBot(config)

        # --- Manually Load Vector Store --- 
        # We need to load the specific DB and embedding function used during population
        logger.info(f"Loading embedding model: {config.embedding_model}")
        embedding_function = HuggingFaceEmbeddings(
            model_name=config.embedding_model,
            model_kwargs={"device": "cuda:0"} # Assuming GPU for consistency
        )
        
        vectorstore_path = str(Path(rag_core_advanced_dir) / 'chroma_db_advanced')
        collection_name = config.collection_name # Ensure this matches the populated DB
        logger.info(f"Connecting to ChromaDB vector store at: {vectorstore_path}")
        logger.info(f"Using collection name: {collection_name}")

        # Connect to the existing ChromaDB instance
        vectorstore = Chroma(
            collection_name=collection_name,
            embedding_function=embedding_function,
            persist_directory=vectorstore_path
        )
        
        # Assign the loaded vector store to the RAGBot instance
        rag_bot.vectorstore = vectorstore
        logger.info("Vector store loaded and assigned to RAGBot.")
        
        # --- Define Test Query --- 
        # test_query = "what are the risks of amniocentesis?"
        # test_query = "management of PPROM"
        # test_query = "labetalol dosage"
        # test_query = "guidelines for gestational diabetes screening"
        test_query = "What are the considerations when performing amniocentesis or CVS for multiple pregnancy?"

        logger.info(f"Executing E2E RAG for query: '{test_query}'")

        # --- Perform Retrieval --- 
        logger.info("Step 1: Retrieving documents...")
        retrieved_docs = rag_bot.retrieve_documents(test_query)
        
        if not retrieved_docs:
            logger.error("No documents retrieved, cannot generate response.")
            return
            
        logger.info(f"Retrieved {len(retrieved_docs)} documents for context.")
        # Optional: Print retrieved docs for debugging?
        # for i, doc in enumerate(retrieved_docs):
        #     print(f"  Retrieved Doc {i+1} Content: {doc.page_content[:100]}...")
            
        # --- Generate Response --- 
        logger.info("Step 2: Generating response using retrieved documents...")
        # Assuming generate_response takes the question and the retrieved documents
        response_data = rag_bot.generate_response(test_query, retrieved_docs)
        final_answer = response_data.get("generation", "No answer generated.")

        # --- Print Final Answer --- 
        logger.info(f"\n--- Generated Response for query: '{test_query}' ---")
        print(final_answer)

    except Exception as e:
        logger.exception(f"An error occurred during the E2E RAG test: {e}")
    finally:
        end_time = time.time()
        duration = end_time - start_time
        logger.info(f"--- End-to-End RAG Test Finished in {duration:.2f} seconds --- ")

if __name__ == "__main__":
    test_e2e_rag() 