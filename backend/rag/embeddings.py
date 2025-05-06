"""
Handles loading and embedding of Markdown files into a vector store with ChromaDB.
Optimized to compute embeddings only once and handle new documents incrementally.
"""

import os
import re
from typing import List, Dict, Set, Tuple
from pathlib import Path
from collections import defaultdict
import spacy
import torch
import logging
import hashlib
from langchain.schema import Document
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.vectorstores.utils import filter_complex_metadata
from django.conf import settings

# Use standard logging
logger = logging.getLogger(__name__)


def clean_text(text: str) -> str:
    """Remove unwanted tokens such as /C15, /uniFB01, /C0 etc."""
    return re.sub(r'/[A-Za-z0-9]+', '', text)


def split_sections(markdown: str) -> List[Tuple[int, str, str]]:
    """
    Split the markdown document into sections based on headers (lines starting with #).
    Handles multiple header levels (e.g., ##, ###).
    Filters out sections starting with '## References'.
    Returns a list of tuples: (header_level, header_text, section_content).
    """
    raw_sections = re.split(r'(?m)(?=^#+\s)', markdown)
    structured_sections = []
    for section in raw_sections:
        section = section.strip()
        if not section:
            continue

        # Check if it looks like a header line
        if section.startswith('#'):
            # Find the end of the actual header line (first newline or end of string)
            header_end_index = section.find('\n')
            if header_end_index == -1:
                header_line = section.strip()
                content_after_header = "" # No content after header-only section
            else:
                header_line = section[:header_end_index].strip()
                content_after_header = section[header_end_index:].strip()

            # Now, parse the isolated header_line
            level = 0
            while level < len(header_line) and header_line[level] == '#':
                level += 1

            # Check for valid header format (# followed by space)
            if level < len(header_line) and header_line[level] == ' ':
                header_text_only = header_line[level:].strip()

                # Filter references
                if level == 2 and header_text_only.lower() == "references":
                    continue

                # Append the correctly separated tuple
                structured_sections.append((level, header_text_only, content_after_header))
            else:
                # Line started with # but wasn't a valid header (e.g., #no-space)
                # Treat the whole section as content belonging to the previous header? Ignored for now.
                logger.debug(f"Skipping line starting with '#' but not a valid header: {header_line[:50]}...")
                pass 
        else:
             # Section doesn't start with # - content before the first header? Ignored for now.
             logger.debug(f"Skipping content not starting with '#': {section[:50]}...")
             pass

    return structured_sections


def split_table_and_text(header_level: int, header_text: str, section_content: str) -> Tuple[str, str]:
    """
    Given section content (without the header line), split it into a table block 
    and a subsequent text block.
    Prepends the original header line (reconstructed) to both blocks.

    Identifies a table by checking if the first paragraph contains multiple lines and pipes.
    If a table is found, it consumes subsequent paragraphs only if they also contain pipes.
    Any remaining paragraphs become the text_after_table.

    Returns two strings:
      - table_block: Full header line + identified table paragraphs (or empty string)
      - text_after_table: Full header line + text paragraphs after the table (or all text if no table found)
    """
    full_header_line = f"{'#' * header_level} {header_text}"

    if not section_content:
        # If only a header exists, return it as text block, table is empty
        return "", full_header_line

    paragraphs = re.split(r'\n\s*\n', section_content.strip())
    
    table_paragraphs = []
    text_after_paragraphs = []
    table_found = False
    table_ended = False

    # Check if the first paragraph looks like a table
    if paragraphs and "|" in paragraphs[0] and "\n" in paragraphs[0]:
        table_found = True
        table_paragraphs.append(paragraphs[0])
        # Consume subsequent paragraphs only if they also look like table rows
        for i in range(1, len(paragraphs)):
            if not table_ended and "|" in paragraphs[i]: # Simple check: contains pipe?
                table_paragraphs.append(paragraphs[i])
            else:
                table_ended = True # Stop consuming for table once a non-pipe paragraph is found
                text_after_paragraphs.append(paragraphs[i])
    else:
        # No table found at the start, all paragraphs are text
        text_after_paragraphs = paragraphs

    # Construct the final blocks
    table_content = "\n\n".join(tp.strip() for tp in table_paragraphs)
    text_after_content = "\n\n".join(tap.strip() for tap in text_after_paragraphs)

    # Prepend the full header line to the content parts
    table_block_final = f"{full_header_line}\n{table_content}" if table_content else ""
    text_after_table_final = f"{full_header_line}\n{text_after_content}" if text_after_content else ""

    # Handle case where only a header existed (section_content was empty)
    if not table_block_final and not text_after_table_final and not section_content:
         text_after_table_final = full_header_line
    # Handle case where content was only a table, ensure header isn't added to text
    elif table_block_final and not text_after_content:
         text_after_table_final = ""
    # Handle case where content was only text (no table found), ensure text block includes header
    elif not table_block_final and text_after_content and not text_after_table_final.startswith(full_header_line):
         text_after_table_final = f"{full_header_line}\n{text_after_content}"
         
    # If the only content was text (no table found), text_after_table_final should be populated correctly
    # If the only content was a table (no text found), text_after_table_final should be empty
    # If both table and text found, both should be populated with headers

    return table_block_final, text_after_table_final


def read_markdown_file(file_path: str) -> str:
    """Read a markdown file and return its content as a string."""
    try:
        # Ensure data directory exists (can be called multiple times safely)
        os.makedirs(settings.RAG_DATA_DIR, exist_ok=True)
        # Assuming file_path is relative to data_dir or an absolute path
        full_path = Path(settings.RAG_DATA_DIR) / file_path if not Path(file_path).is_absolute() else Path(file_path)
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as exc:
        logger.error(f"Failed to read markdown file {file_path}: {exc}")
        raise


# Simple regex for common citation patterns
# Example: [1], [1, 2], [1-3], (Author, 2023), (Author et al., 2022)
CITATION_REGEX = re.compile(r"(\[\d+(?:[,\- ]*\d+)*\]|\([A-Za-z][A-Za-z\s&]+(?:et al\.)?,?\s*\d{4}\))")

class DocumentProcessor:
    """
    Loads Markdown documents, splits them into chunks, and creates/updates
    a Chroma vector store with GPU acceleration. Uses Django settings.
    """

    def __init__(self):
        """
        Initialize DocumentProcessor using Django settings.
        Sets up device configuration but defers embedding model and NER pipeline loading.
        """
        try:
            logger.info("Initializing DocumentProcessor")
            # Store configuration from Django settings
            self.embedding_model_name = settings.RAG_EMBEDDING_MODEL
            self.chroma_dir = settings.RAG_VECTORSTORE_PATH
            self.collection_name = settings.RAG_COLLECTION_NAME
            self.chunk_size = settings.RAG_CHUNK_SIZE # Added from settings
            self.chunk_overlap = settings.RAG_CHUNK_OVERLAP # Added from settings
            self.data_dir = settings.RAG_DATA_DIR # Added from settings

            self.embedding = None  # Defer loading
            self.ner_pipeline = None # Defer loading
            # TODO: Make NER model configurable via settings if needed
            self.ner_model_name = "en_core_sci_lg" # Hardcode for now
            self.device = "cpu"   # Default device, will be updated in _get_embedding_function
            self.batch_size = 8 # Default batch size, could make configurable

            # Note: Device detection is moved to _get_embedding_function
            # Batch size update based on CUDA device is also moved there

            logger.info("DocumentProcessor initialized (embedding & NER loading deferred)")
        except Exception as exc:
            logger.error(f"Failed to initialize DocumentProcessor: {exc}")
            raise

    def _get_embedding_function(self):
        """Initializes and returns the HuggingFace embedding function if not already loaded."""
        if self.embedding is None:
            # Dynamic device detection moved here
            if torch.cuda.is_available():
                self.device = "cuda"
                self.batch_size = 16 # Increase batch size for CUDA
                logger.info(f"CUDA device detected. Using device: {self.device}, batch size: {self.batch_size}")
            elif torch.backends.mps.is_available() and torch.backends.mps.is_built():
                 # Add is_built() check for robustness
                 self.device = "mps"
                 self.batch_size = 8 # Keep batch size moderate for MPS
                 # More explicit logging for MPS
                 logger.info(f"MPS device detected and available. Using device: {self.device}, batch size: {self.batch_size}")
            else:
                self.device = "cpu"
                self.batch_size = 8 # Keep batch size moderate for CPU
                logger.warning(f"No CUDA or MPS device found/available. Using CPU. Device: {self.device}, batch size: {self.batch_size}")

            logger.info(f"Loading embedding model '{self.embedding_model_name}' onto device '{self.device}'")
            try:
                # Note: dtype is not directly configurable in HuggingFaceEmbeddings
                self.embedding = HuggingFaceEmbeddings(
                    model_name=self.embedding_model_name,
                    model_kwargs={"device": self.device} # Use determined device
                )
                logger.info(f"Embedding model '{self.embedding_model_name}' loaded successfully onto {self.device}.")
            except Exception as exc:
                logger.error(f"Failed to load embedding model '{self.embedding_model_name}': {exc}")
                raise # Re-raise exception to halt processing if model load fails
        return self.embedding

    def _get_ner_pipeline(self):
        """Initializes and returns the scispaCy NER pipeline if not already loaded."""
        if self.ner_pipeline is None:
            logger.info(f"Loading NER pipeline: '{self.ner_model_name}'")
            try:
                # Ensure spacy model directory exists (if model needs download)
                # This path might need adjustment depending on spacy install location
                # or if using a custom path. For simplicity, assume spacy handles it.
                # os.makedirs(some_spacy_model_path, exist_ok=True)

                # Consider adding error handling for model not found
                self.ner_pipeline = spacy.load(self.ner_model_name)
                logger.info("NER pipeline loaded successfully.")
            except OSError as e:
                logger.error(f"Failed to load NER pipeline '{self.ner_model_name}'. "
                             f"Ensure the model is installed (e.g., via pip install <URL>). Error: {e}")
                raise # Halt if NER model is essential and fails to load
            except Exception as exc:
                logger.error(f"An unexpected error occurred loading NER pipeline '{self.ner_model_name}': {exc}")
                raise
        return self.ner_pipeline

    def process_markdown_document(self, file_path: str) -> List[Document]:
        """
        Process a single markdown document into chunks with hierarchical, NER, version hash, and citation metadata.
        Returns a list of Document objects ready for embedding.
        """
        try:
            logger.debug(f"Processing markdown file: {file_path}")
            # Read raw content first for hashing - reading logic now handles data_dir
            raw_content = read_markdown_file(file_path)
            content_hash = hashlib.sha256(raw_content.encode('utf-8')).hexdigest()

            # Extract base metadata including the hash
            filename = os.path.basename(file_path)
            base_metadata = {"source": filename, "content_hash": content_hash}

            # Clean and split the content hierarchically
            cleaned = clean_text(raw_content) # Use raw_content here
            hierarchical_sections = split_sections(cleaned)

            # Load NER pipeline once per document
            ner_pipeline = self._get_ner_pipeline()

            chunks = []
            current_headers = {i: None for i in range(1, 7)}

            for section_index, (level, current_section_header_text, section_content) in enumerate(hierarchical_sections):
                current_headers[level] = current_section_header_text
                for i in range(level + 1, 7):
                    current_headers[i] = None

                # --- Split section into table and text_after_table --- 
                table_block, text_after_table = split_table_and_text(level, current_section_header_text, section_content)

                # --- Prepare Base Hierarchical Metadata (excluding type) --- 
                hier_metadata_base = {f'h{i}_header': current_headers.get(i) for i in range(1, level + 1) if current_headers.get(i)}
                hier_metadata_base["current_header_level"] = level
                hier_metadata_base["current_header_text"] = current_section_header_text

                # --- Process Table Block (if exists) --- 
                if table_block:
                    chunk_metadata = {**base_metadata, **hier_metadata_base, "type": "table"}
                    # Apply NER
                    doc = ner_pipeline(table_block)
                    entities = defaultdict(list)
                    for ent in doc.ents:
                        entities[ent.label_].append(ent.text)
                    if entities:
                        chunk_metadata["entities"] = dict(entities)
                        
                        # Apply Citation Tracking
                        citations = CITATION_REGEX.findall(table_block)
                        chunk_metadata["citation_count"] = len(citations)
                        if citations:
                            chunk_metadata["citation_markers"] = citations

                        chunks.append(Document(
                            page_content=table_block,
                            metadata=chunk_metadata
                        ))

                # --- Process Text Block AFTER Table (if exists) --- 
                # Check if text_after_table contains more than just the header line
                meaningful_text_exists = text_after_table and text_after_table.strip() != f"{'#' * level} {current_section_header_text}"
                if meaningful_text_exists:
                    chunk_metadata = {**base_metadata, **hier_metadata_base, "type": "text"}
                    # Apply NER
                    doc = ner_pipeline(text_after_table)
                    entities = defaultdict(list)
                    for ent in doc.ents:
                        entities[ent.label_].append(ent.text)
                    if entities:
                        chunk_metadata["entities"] = dict(entities)
                        
                        # Apply Citation Tracking
                        citations = CITATION_REGEX.findall(text_after_table)
                        chunk_metadata["citation_count"] = len(citations)
                        if citations:
                            chunk_metadata["citation_markers"] = citations

                        # TODO: Implement actual chunking based on self.chunk_size / self.chunk_overlap here
                        # For now, adding the entire text block as one chunk
                        chunks.append(Document(
                            page_content=text_after_table, # This should be further chunked
                            metadata=chunk_metadata
                        ))
            logger.debug(f"Created {len(chunks)} chunks with metadata from {file_path}")
            return chunks
        except Exception as exc:
            logger.error(f"Failed to process markdown document {file_path}: {exc}")
            raise

    def get_processed_files(self) -> Dict[str, str]:
        """
        Get the set of already processed files and their content hashes from ChromaDB.
        Returns a dictionary mapping filename to content_hash.
        """
        processed_files_hashes = {}
        try:
            # Use chroma_dir from settings
            if not os.path.exists(self.chroma_dir) or not os.listdir(self.chroma_dir):
                logger.info("No existing Chroma DB found or DB directory is empty.")
                return processed_files_hashes

            # Ensure embedding function is loaded before connecting if DB might be empty
            # (Chroma might error if embedding function is None and collection doesn't exist)
            # However, for 'get', it might not be strictly needed if the collection exists.
            # For safety, load it.
            embedding_fx = self._get_embedding_function()

            vectorstore_client = Chroma(
                collection_name=self.collection_name, # Use collection_name from settings
                persist_directory=self.chroma_dir,
                embedding_function=embedding_fx # Provide embedding function
            )

            # Fetch IDs and metadata for all documents
            # Use a reasonable limit if the DB could be huge, or process in batches
            # For now, fetch all. Handle potential memory issues if DB is massive.
            collection_data = vectorstore_client.get(include=["metadatas"])
            all_metadata = collection_data.get("metadatas", [])
            doc_ids = collection_data.get("ids", [])

            if not all_metadata:
                logger.info("Chroma DB exists but contains no metadata (or collection is empty).")
                return processed_files_hashes
                
            logger.info(f"Checking metadata for {len(doc_ids)} entries in Chroma DB...")
            
            # Store the latest hash found for each unique source filename
            # Assumes newer additions might overwrite older entries for the same source
            # A more robust approach might involve timestamps if available
            for metadata in all_metadata:
                if metadata and metadata.get("source") and metadata.get("content_hash"):
                    source_file = metadata["source"]
                    content_hash = metadata["content_hash"]
                    # Store the hash, potentially overwriting if multiple chunks from same file exist
                    # (all chunks from the same file *should* have the same hash anyway)
                    processed_files_hashes[source_file] = content_hash
                # else: log missing source or hash?

            logger.info(f"Found {len(processed_files_hashes)} unique processed files with content hashes.")

        except Exception as exc:
            import traceback
            logger.warning(f"Error getting processed files/hashes, assuming none: {exc}\\n{traceback.format_exc()}")
            # Return empty dict on error
            processed_files_hashes = {}

        return processed_files_hashes

    def load_and_process_documents(self, file_paths: List[str]) -> List[Document]:
        """
        Process a list of markdown files found in settings.RAG_DATA_DIR.
        Only processes files if they are new or their content hash has changed.
        Returns a list of Document objects for new/updated files.
        """
        # Ensure data directory exists before scanning
        os.makedirs(self.data_dir, exist_ok=True)
        logger.info(f"Scanning for markdown files in: {self.data_dir}")

        # Find markdown files in the configured data directory
        markdown_files = list(Path(self.data_dir).glob("*.md"))
        logger.info(f"Found {len(markdown_files)} markdown files in data directory.")

        if not markdown_files:
            logger.warning(f"No markdown files found in {self.data_dir}. Nothing to process.")
            return []

        # Get already processed files and their hashes
        processed_files_info = self.get_processed_files() # Returns Dict[filename, hash]
        logger.info(f"Found {len(processed_files_info)} files previously processed according to vector store metadata.")

        files_to_process = []
        files_to_delete_ids = [] # Placeholder for future deletion logic

        for file_path_obj in markdown_files: # Use found files
            file_path = str(file_path_obj)
            filename = os.path.basename(file_path)
            logger.debug(f"Checking file: {filename}")
            try:
                # Read content to calculate current hash - uses updated read_markdown_file
                current_content = read_markdown_file(file_path) # Pass the full path
                current_hash = hashlib.sha256(current_content.encode('utf-8')).hexdigest()

                stored_hash = processed_files_info.get(filename)

                if stored_hash is None:
                    logger.info(f"  File '{filename}' is new. Adding for processing.")
                    files_to_process.append(file_path)
                elif stored_hash != current_hash:
                    logger.info(f"  File '{filename}' has changed (hash mismatch). Adding for reprocessing.")
                    # TODO: Need logic to find and delete old chunks for this file
                    # For now, we just re-add, potentially causing duplicates until deletion is implemented
                    # files_to_delete_ids.extend(find_ids_for_file(filename)) # Requires DB query
                    files_to_process.append(file_path)
                else:
                    logger.debug(f"  File '{filename}' is unchanged (hash matches). Skipping.")

            except Exception as e:
                logger.error(f"Error checking file {filename}: {e}. Skipping.")

        # TODO: Implement deletion of old chunks before adding new ones
        # if files_to_delete_ids:
        #    delete_from_vectorstore(files_to_delete_ids)

        if not files_to_process:
            logger.info("No new or updated documents to process.")
            return []

        logger.info(f"Found {len(files_to_process)} new or updated documents to process.")

        # Process all new/updated documents
        all_chunks = []
        # Determine batch size based on device detected during embedding loading
        effective_batch_size = self.batch_size # Use batch size determined in _get_embedding_function
        for i in range(0, len(files_to_process), effective_batch_size):
            batch_paths = files_to_process[i:i+effective_batch_size]
            logger.info(f"Processing batch {i//effective_batch_size + 1}/{(len(files_to_process)-1)//effective_batch_size + 1} with {len(batch_paths)} files")
            batch_chunks = []
            for file_path in batch_paths:
                try:
                    chunks = self.process_markdown_document(file_path)
                    batch_chunks.extend(chunks)
                except Exception as e:
                    logger.error(f"Failed processing document {file_path} in batch: {e}")
                    # Decide whether to skip the file or halt the batch
                    continue # Skip this file, process rest of batch

            all_chunks.extend(batch_chunks)

        logger.info(f"Created {len(all_chunks)} document chunks from {len(files_to_process)} new/updated files.")
        return all_chunks

    def update_vectorstore(self, documents: List[Document]) -> Chroma:
        """
        Updates the existing vector store with new documents or creates a new one.
        Loads the embedding model only if needed.
        Uses GPU acceleration for embedding generation if available.
        Returns the updated vector store instance.
        """
        try:
            # Ensure embedding function is loaded *before* any Chroma operations that need it
            embedding_function = self._get_embedding_function()

            # Check if we need to create a new vector store or update existing one
            # Use chroma_dir from settings
            db_exists = os.path.exists(self.chroma_dir) and os.listdir(self.chroma_dir)

            if not db_exists:
                if not documents:
                    logger.warning("No documents provided and no existing DB. Cannot create/update vector store.")
                    # Return a Chroma instance configured but potentially empty
                    return Chroma(
                        collection_name=self.collection_name, # Use collection_name from settings
                        embedding_function=embedding_function, # Needed even if empty for consistency?
                        persist_directory=self.chroma_dir # Use chroma_dir from settings
                    )

                logger.info(f"Creating new vector store at {self.chroma_dir} with {len(documents)} documents.")
                # Create new vector store with GPU-accelerated embeddings
                # For large document sets, process in smaller batches for GPU memory efficiency
                vectorstore = Chroma( # Create empty first for batch adding
                    collection_name=self.collection_name, # Use collection_name from settings
                    embedding_function=embedding_function,
                    persist_directory=self.chroma_dir # Use chroma_dir from settings
                )
                # Use batch size determined by device detection
                effective_batch_size = min(100, self.batch_size * 4) # Base multiplier on detected batch_size
                for i in range(0, len(documents), effective_batch_size):
                    batch = documents[i:i+effective_batch_size]
                    logger.info(f"Adding batch {i//effective_batch_size + 1}/{(len(documents)-1)//effective_batch_size + 1} with {len(batch)} documents")
                    # Filter complex metadata before adding
                    filtered_batch = filter_complex_metadata(batch)
                    vectorstore.add_documents(filtered_batch)
                    # Persist after each batch to save progress and manage memory
                    vectorstore.persist()
                logger.info(f"Finished creating new vector store.")

            else: # DB exists
                # Connect to existing vector store
                logger.info(f"Connecting to existing vector store at: {self.chroma_dir}")
                vectorstore = Chroma(
                    collection_name=self.collection_name, # Use collection_name from settings
                    embedding_function=embedding_function, # Now needed for adding
                    persist_directory=self.chroma_dir # Use chroma_dir from settings
                )

                if documents:
                    logger.info(f"Adding {len(documents)} new documents to existing vector store.")
                    # Add documents in batches using detected batch size
                    effective_batch_size = min(100, self.batch_size * 4)
                    for i in range(0, len(documents), effective_batch_size):
                        batch = documents[i:i+effective_batch_size]
                        logger.info(f"Adding batch {i//effective_batch_size + 1}/{(len(documents)-1)//effective_batch_size + 1} with {len(batch)} documents")
                        # Filter complex metadata before adding
                        filtered_batch = filter_complex_metadata(batch)
                        vectorstore.add_documents(filtered_batch)
                        vectorstore.persist() # Persist after each batch
                    logger.info(f"Finished updating vector store.")
                else:
                    logger.info("No new documents to add to existing vector store.")

            return vectorstore
        except Exception as exc:
            import traceback
            logger.error(f"Failed to update vector store: {exc}\\n{traceback.format_exc()}")
            raise
