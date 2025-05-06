import os
import torch
import pickle # Added for BM25
import json   # Added for loading all docs
import re     # Added for tokenizer
import logging # Added
from pathlib import Path # Added for path handling
from typing import Dict, List, Any, Generator, Tuple, AsyncGenerator
from langchain.schema import Document # Added for reconstructing docs
from langchain_community.vectorstores import Chroma # Added for type hinting
from rank_bm25 import BM25Okapi # Added for BM25 type hinting
from langchain.prompts import PromptTemplate
from rapidfuzz import fuzz
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    pipeline,
    BitsAndBytesConfig,
    AutoModelForSeq2SeqLM,
    TextIteratorStreamer
)
from itertools import chain
from threading import Thread
from django.conf import settings # Added
from accelerate import Accelerator # Keep accelerator if used elsewhere
from sentence_transformers import CrossEncoder  # For Reranker Model
from langchain.docstore.document import Document
from langchain_huggingface.embeddings import HuggingFaceEmbeddings
import asyncio # Added for async sleep

# Initialize logger and set CUDA memory allocation config
# logger = setup_logger("rag")
logger = logging.getLogger(__name__)
# Consider making this env var setting optional or configurable via settings
# os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'

# Define the simple tokenizer (must match the one used for indexing)
def simple_tokenizer(text):
    """A basic tokenizer: lowercase and split by non-alphanumeric characters."""
    if not isinstance(text, str):
        return []
    text = text.lower()
    tokens = re.split(r'\W+', text) # Split by one or more non-alphanumeric
    return [token for token in tokens if token] # Remove empty strings

class RAGBot:
    """
    A RAG-based chatbot for Women's Reproductive Healthcare.
    Combines document retrieval with LLM generation and document reranking.
    Loads LLM internally for generation based on Django settings.
    Uses Django settings for configuration.
    """
    def __init__(self):
        try:
            logger.info("Initializing RAGBot")
            # Removed: self.config = config

            # --- Dynamic Device and Dtype Detection ---
            if torch.cuda.is_available():
                self.device = "cuda"
                # If multiple GPUs, explicitly set to cuda:0 or allow config
                # self.device_index = 0 # Example for pipeline
                logger.info("CUDA device detected.")
            elif torch.backends.mps.is_available():
                self.device = "mps"
                # self.device_index = None # MPS doesn't use index like CUDA
                logger.info("MPS device detected.")
            else:
                self.device = "cpu"
                # self.device_index = None
                logger.warning("No CUDA or MPS device found. Using CPU.")

            try:
                self.torch_dtype = getattr(torch, settings.LLM_TORCH_DTYPE, torch.float16)
                if settings.LLM_TORCH_DTYPE not in ['bfloat16', 'float16', 'float32']:
                    logger.warning(f"Invalid LLM_TORCH_DTYPE '{settings.LLM_TORCH_DTYPE}'. Using torch.float16.")
                    self.torch_dtype = torch.float16
                else:
                     self.torch_dtype = getattr(torch, settings.LLM_TORCH_DTYPE)
                logger.info(f"Using torch dtype: {self.torch_dtype}")
            except AttributeError:
                logger.warning(f"Invalid LLM_TORCH_DTYPE '{settings.LLM_TORCH_DTYPE}' in settings. Falling back to torch.float16.")
                self.torch_dtype = torch.float16
            # --- End Device/Dtype Detection ---

            # Accelerator might not be needed if manually placing models
            # self.accelerator = Accelerator()

            logger.info(f"Loading tokenizer: {settings.LLM_TOKENIZER_NAME_OR_PATH}")
            self.max_tokens = 2048

            # --- Load LLM and Tokenizer (Handles Quantization based on Settings) ---
            logger.info(f"Loading LLM Tokenizer: {settings.LLM_TOKENIZER_NAME_OR_PATH}")
            try:
                self.llm_tokenizer = AutoTokenizer.from_pretrained(
                    settings.LLM_TOKENIZER_NAME_OR_PATH,
                    trust_remote_code=True
                )
                if self.llm_tokenizer.pad_token is None:
                    logger.warning("LLM tokenizer missing pad token, setting to eos_token.")
                    self.llm_tokenizer.pad_token = self.llm_tokenizer.eos_token
            except Exception as e:
                logger.exception(f"Failed to load LLM tokenizer: {settings.LLM_TOKENIZER_NAME_OR_PATH}")
                raise

            # Determine quantization config based on settings
            quantization_config = None
            bitsandbytes_kwargs = {}
            if settings.LLM_QUANTIZATION == '4bit':
                logger.info("Setting up 4-bit quantization config.")
                try:
                    # Ensure bitsandbytes is available
                    import bitsandbytes
                    quantization_config = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_quant_type="nf4",
                        bnb_4bit_use_double_quant=True,
                        bnb_4bit_compute_dtype=self.torch_dtype # Use detected/configured dtype
                    )
                    # Explicitly add load_in_4bit=True to main kwargs
                    bitsandbytes_kwargs['load_in_4bit'] = True
                    logger.info("4-bit config created.")
                except ImportError:
                    logger.error("BitsAndBytes not installed or import failed. Cannot use 4-bit quantization.")
                    raise ImportError("4-bit quantization requires bitsandbytes. Please install it.")
                except Exception as e:
                    logger.error(f"Error creating 4-bit BitsAndBytesConfig: {e}")
                    raise # Re-raise other unexpected errors
            elif settings.LLM_QUANTIZATION == '8bit':
                 logger.info("Setting up 8-bit quantization config.")
                 try:
                     # Ensure bitsandbytes is available
                     import bitsandbytes
                     quantization_config = BitsAndBytesConfig(load_in_8bit=True)
                     # Explicitly add load_in_8bit=True to main kwargs
                     bitsandbytes_kwargs['load_in_8bit'] = True
                     logger.info("8-bit config created.")
                 except ImportError:
                     logger.error("BitsAndBytes not installed or import failed. Cannot use 8-bit quantization.")
                     raise ImportError("8-bit quantization requires bitsandbytes. Please install it.")
                 except Exception as e:
                     logger.error(f"Error creating 8-bit BitsAndBytesConfig: {e}")
                     raise # Re-raise other unexpected errors
            elif settings.LLM_QUANTIZATION != 'none':
                logger.warning(f"Unsupported LLM_QUANTIZATION value: '{settings.LLM_QUANTIZATION}'. Loading model without quantization.")
            else:
                logger.info("LLM_QUANTIZATION is 'none'. Loading model without quantization.")
                # Ensure no quantization flags are passed if set to 'none'
                bitsandbytes_kwargs['load_in_4bit'] = False
                bitsandbytes_kwargs['load_in_8bit'] = False

            logger.info(f"Loading LLM Model: {settings.LLM_MODEL_NAME_OR_PATH}")
            try:
                self.llm_model = AutoModelForCausalLM.from_pretrained(
                    settings.LLM_MODEL_NAME_OR_PATH,
                    torch_dtype=self.torch_dtype,
                    device_map=settings.LLM_DEVICE_MAP, # Use device_map from settings
                    quantization_config=quantization_config, # Pass the generated config (or None)
                    trust_remote_code=True,
                    **bitsandbytes_kwargs # Pass explicit load flags
                )
                self.llm_model.eval() # Set to evaluation mode
                logger.info(f"LLM model loaded successfully. Device map: '{settings.LLM_DEVICE_MAP}', Quantization: '{settings.LLM_QUANTIZATION}'")
            except ImportError as e:
                # Specific check for quantization-related import errors if config was attempted
                if quantization_config and ('bitsandbytes' in str(e) or 'accelerate' in str(e)):
                     logger.error(f"ImportError likely due to quantization setup ({settings.LLM_QUANTIZATION}). Missing/incompatible libraries (accelerate, bitsandbytes?): {e}")
                else:
                    logger.error(f"ImportError loading LLM, potentially missing libraries: {e}")
                raise
            except Exception as e:
                logger.exception(f"Failed to load LLM model: {settings.LLM_MODEL_NAME_OR_PATH}")
                raise

            # --- Remove the old generator pipeline setup ---
            self.generator = None # Explicitly set to None as it's no longer used
            logger.info("Removed old text-generation pipeline setup.")

            # ----- Query Transformation Model -----
            logger.info(f"Loading Query Transformation Model: {settings.RAG_QUERY_TRANSFORMATION_MODEL}")
            self.query_transformer_tokenizer = AutoTokenizer.from_pretrained(settings.RAG_QUERY_TRANSFORMATION_MODEL)
            # Load model first, then move to device
            self.query_transformer_model = AutoModelForSeq2SeqLM.from_pretrained(
                settings.RAG_QUERY_TRANSFORMATION_MODEL,
                torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
                # Removed: device_map="auto"
            )
            logger.info(f"Moving Query Transformation model to device: {self.device}")
            self.query_transformer_model = self.query_transformer_model.to(self.device)
            self.query_transformer_model.eval()

            logger.info("Creating text2text-generation pipeline.")
            self.query_transformer = pipeline(
                "text2text-generation",
                model=self.query_transformer_model,
                tokenizer=self.query_transformer_tokenizer,
                device=self.device, # Use detected device index/string
                max_new_tokens=50, # TODO: Make configurable?
                do_sample=False,
                # temperature=0.7 # Temperature from settings used in main generator
            )

            # ----- Lazy Load Reranker Model -----
            logger.info("Deferring Reranker model loading to save memory")
            self.reranker_model = None
            # Store reranker model name from settings for lazy loading
            self.reranker_model_name = settings.RAG_RERANKER_MODEL

            # The vectorstore should be set externally (e.g., loaded via DocumentProcessor/management command)
            self.vectorstore = None

            # --- Load BM25 Index and All Documents --- 
            self.bm25_index: BM25Okapi | None = None
            self.bm25_metadata_ref: List[Dict] = []
            self.all_documents: List[Document] = []
            self._load_bm25_and_docs() # Uses paths derived from settings internally

            # --- Load ChromaDB Vector Store ---
            self._load_vector_store()

            # Parameters for retrieval and reranking.
            # TODO: Make these configurable via settings?
            self.over_retrieve_k = 20  # Over-retrieve candidates
            self.k = 5  # Final number of documents after reranking

            # Initialize conversation history.
            self.conversation_history = []
            self.max_history_length = settings.RAG_MAX_HISTORY_LENGTH

            logger.info("RAGBot initialized successfully")
        except Exception as exc:
            logger.exception(f"Failed to initialize RAGBot: {exc}") # Use logger.exception
            raise

    def _load_vector_store(self):
        """Loads the ChromaDB vector store using paths and embedding model from settings."""
        logger.info("Loading ChromaDB vector store...")
        vectorstore_path = settings.RAG_VECTORSTORE_PATH
        collection_name = settings.RAG_COLLECTION_NAME
        embedding_model_name = settings.RAG_EMBEDDING_MODEL # Get model name

        if not Path(vectorstore_path).exists() or not os.listdir(vectorstore_path):
            logger.error(f"ChromaDB path {vectorstore_path} does not exist or is empty. "
                         f"Run the indexing/embedding process first.")
            self.vectorstore = None
            # Optionally raise an error if the vector store is essential for startup
            # raise FileNotFoundError(f"ChromaDB not found at {vectorstore_path}")
            return

        try:
            # Initialize the embedding function needed by Chroma
            # Use the device detected during RAGBot initialization
            logger.info(f"Initializing embedding function ({embedding_model_name}) for ChromaDB on device {self.device}.")
            embedding_function = HuggingFaceEmbeddings(
                model_name=embedding_model_name,
                model_kwargs={"device": self.device}
            )

            self.vectorstore = Chroma(
                collection_name=collection_name,
                embedding_function=embedding_function,
                persist_directory=vectorstore_path
            )
            logger.info(f"Connected to existing ChromaDB vector store at: {vectorstore_path}")

            # Optional: Perform a quick check (e.g., count items) if needed
            # count = self.vectorstore._collection.count()
            # logger.info(f"Vector store contains {count} items.")

        except Exception as e:
            logger.exception(f"Failed to load ChromaDB vector store from {vectorstore_path}: {e}")
            self.vectorstore = None
            # Optionally raise error
            # raise

    def _load_bm25_and_docs(self):
        """Loads the BM25 index, metadata ref, and all documents from disk using paths derived from settings."""
        logger.info("Loading BM25 index and all documents...")
        # Construct paths relative to the configured RAG_DATA_DIR
        base_data_dir = Path(settings.RAG_DATA_DIR)
        index_dir = base_data_dir / 'indexes'
        chunks_dir = base_data_dir / 'chunks'
        index_file_path = index_dir / 'bm25_index.pkl'
        chunks_json_path = chunks_dir / 'all_documents_chunks.json'

        # Ensure directories exist (optional, depends if creation is handled elsewhere)
        # os.makedirs(index_dir, exist_ok=True)
        # os.makedirs(chunks_dir, exist_ok=True)

        # Load BM25 index and metadata reference
        if index_file_path.exists():
            try:
                with open(index_file_path, 'rb') as f_in:
                    loaded_data = pickle.load(f_in)
                self.bm25_index = loaded_data.get('bm25_index')
                self.bm25_metadata_ref = loaded_data.get('metadata_ref', [])
                if not self.bm25_index or not isinstance(self.bm25_index, BM25Okapi):
                    logger.error("Loaded BM25 data is invalid or missing index.")
                    self.bm25_index = None # Ensure it's None if loading failed
                else:
                    logger.info(f"BM25 index loaded successfully. Metadata ref count: {len(self.bm25_metadata_ref)}")
            except Exception as e:
                logger.error(f"Failed to load BM25 index from {index_file_path}: {e}")
                self.bm25_index = None # Ensure it's None on error
        else:
            logger.warning(f"BM25 index file not found at {index_file_path}. Sparse search will be skipped.")

        # Load all documents from JSON for reference
        if chunks_json_path.exists():
            try:
                with open(chunks_json_path, 'r', encoding='utf-8') as f:
                    all_chunks_data = json.load(f)
                # Reconstruct Document objects
                self.all_documents = [
                    Document(page_content=chunk_data["page_content"], metadata=chunk_data["metadata"])
                    for chunk_data in all_chunks_data
                    if isinstance(chunk_data, dict) and "page_content" in chunk_data and "metadata" in chunk_data
                ]
                logger.info(f"Loaded {len(self.all_documents)} documents from JSON ({chunks_json_path}).")
                # Verify consistency if possible
                if self.bm25_metadata_ref and len(self.all_documents) != len(self.bm25_metadata_ref):
                    logger.warning("Mismatch between number of loaded documents and BM25 metadata reference count!")

            except Exception as e:
                logger.error(f"Failed to load documents from {chunks_json_path}: {e}")
                self.all_documents = [] # Ensure it's empty on error
        else:
            logger.warning(f"Document chunks JSON file not found at {chunks_json_path}. BM25 results may lack context.")

    def _clear_cuda_cache(self):
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            # torch.cuda.synchronize() # Sync might not be needed just for cache clear

    def _clean_response(self, response: str) -> str:
        # If the response contains "</think>", return only the text after it.
        if "</think>" in response:
            return response.split("</think>", 1)[1].strip()
        answer_marker = "Answer:"
        if answer_marker in response:
            return response.split(answer_marker, 1)[1].strip()
        return response.strip()

    def _is_greeting(self, text: str, threshold: int = 80) -> bool:
        """
        Determine if the provided text is a greeting by using fuzzy matching.
        """
        greetings = ["hi", "hello", "hey"]
        text_lower = text.lower().strip()
        return any(fuzz.ratio(text_lower, greet) >= threshold for greet in greetings)

    def rewrite_query(self, raw_query: str) -> str:
        """
        Commented out query rewriting functionality - returns the original query.
        """
        # logger.info("Rewriting query...")
        # rewritten_query = self.query_transformer(raw_query)[0]["generated_text"]
        # logger.info(f"Rewritten query: {rewritten_query}")
        # return rewritten_query
        return raw_query

    def load_reranker_model(self):
        """Lazily load the reranker model when needed."""
        if self.reranker_model is None:
            logger.info(f"Loading Reranker model '{self.reranker_model_name}' on demand.")
            try:
                # Load onto the device detected during __init__
                self.reranker_model = CrossEncoder(self.reranker_model_name, device=self.device)
                if hasattr(self.reranker_model, "eval"):
                    self.reranker_model.eval()
                logger.info(f"Reranker model loaded successfully onto {self.device}")
            except Exception as e:
                logger.exception(f"Failed to load Reranker model '{self.reranker_model_name}'. Reranking will be skipped.")
                self.reranker_model = None # Ensure it stays None on error
        return self.reranker_model

    def rerank_documents(self, query: str, docs_for_reranking: List[Document]) -> List[Document]:
        """
        Re-rank provided documents using the reranker model.
        Input `docs_for_reranking` are assumed to be the candidates selected by hybrid retrieval.
        """
        if not docs_for_reranking:
            logger.warning("No documents provided for reranking.")
            return []

        # Attempt to load the reranker model
        reranker = self.load_reranker_model()
        if not reranker:
            logger.warning("Reranker model not available. Returning documents without reranking.")
            # Return top K based on RRF/initial retrieval order if reranker failed
            return docs_for_reranking[:self.k]

        # Prepare pairs for the CrossEncoder
        # Use the original query as it's likely what the user intended for relevance
        doc_pairs = [(query, doc.page_content) for doc in docs_for_reranking]

        logger.info(f"Reranking {len(doc_pairs)} document pairs with CrossEncoder...")
        try:
            rerank_scores = reranker.predict(doc_pairs)
        except Exception as e:
            logger.exception(f"Error during reranker prediction: {e}. Returning documents without reranking.")
            return docs_for_reranking[:self.k]

        # Add scores to metadata and sort
        for doc, score in zip(docs_for_reranking, rerank_scores):
            if not hasattr(doc, "metadata"):
                doc.metadata = {}
            doc.metadata["rerank_score"] = float(score) # Store as float

        # Sort documents by rerank score (higher is better)
        # Use a stable sort if needed, but standard sort is usually fine
        sorted_docs = sorted(docs_for_reranking, key=lambda x: x.metadata.get("rerank_score", -float('inf')), reverse=True)

        # Return the top K documents as per configuration
        final_docs = sorted_docs[:self.k]
        logger.info(f"Reranking complete. Returning top {len(final_docs)} documents.")
        return final_docs

    def retrieve_documents(self, query: str) -> List[Document]:
        """
        Performs hybrid retrieval (Dense + Sparse) with RRF combination,
        followed by CrossEncoder reranking.
        """
        try:
            logger.info("--- Starting Hybrid Document Retrieval --- ")
            self._clear_cuda_cache()
            logger.info(f"Original query: {query}")

            if not self.vectorstore:
                logger.error("Vectorstore not set. Cannot perform dense search.")
                return []

            # --- Dense Search (ChromaDB) --- 
            logger.info(f"Performing dense search for top {self.over_retrieve_k}...")
            # Note: Langchain returns List[Tuple[Document, float]], score is distance (lower=better)
            dense_results_with_scores: List[Tuple[Document, float]] = \
                self.vectorstore.similarity_search_with_score(query, k=self.over_retrieve_k)

            if not dense_results_with_scores:
                logger.warning("Dense search returned no results.")
                dense_ranks = {}
            else:
                 logger.info(f"Dense search returned {len(dense_results_with_scores)} results.")
                 # Create a mapping from a unique document identifier to its rank (0-based)
                 # Using page_content as identifier (assuming it's unique enough within results)
                 # A more robust approach might use a dedicated ID if available in metadata
                 dense_ranks = {doc.page_content: rank
                                for rank, (doc, score) in enumerate(dense_results_with_scores)}

            # --- Sparse Search (BM25) --- 
            sparse_scores = []
            if self.bm25_index and self.all_documents:
                logger.info("Performing sparse search with BM25...")
                tokenized_query = simple_tokenizer(query)
                if tokenized_query:
                    # Get scores for ALL documents in the corpus
                    sparse_scores = self.bm25_index.get_scores(tokenized_query)
                    logger.info(f"BM25 search calculated {len(sparse_scores)} scores.")
                else:
                    logger.warning("Query tokenized to empty list, skipping BM25 search.")
                    sparse_scores = []
            else:
                logger.warning("BM25 index or all_documents not loaded, skipping sparse search.")
                sparse_scores = []

            # --- Reciprocal Rank Fusion (RRF) --- 
            logger.info("Performing Reciprocal Rank Fusion (RRF)...")
            rrf_scores: Dict[int, float] = {} # Map document index to RRF score
            k_rrf = 60 # Constant for RRF, balances influence vs rank

            # Process Dense Results for RRF
            # Need to map dense results (by content) back to their original index
            doc_content_to_index = {doc.page_content: i for i, doc in enumerate(self.all_documents)}

            for content, rank in dense_ranks.items():
                if content in doc_content_to_index:
                    doc_index = doc_content_to_index[content]
                    rrf_scores[doc_index] = rrf_scores.get(doc_index, 0.0) + 1.0 / (k_rrf + rank)
                # else: logger.warning(f"Dense result content not found in all_documents mapping: {content[:100]}...")

            # Process Sparse Results for RRF
            if len(sparse_scores) == len(self.all_documents):
                 # Get top N sparse results by index and score for fusion
                 # Sort scores and get indices
                 sparse_ranked_indices = sorted(range(len(sparse_scores)), key=lambda i: sparse_scores[i], reverse=True)

                 # Consider only top N sparse results for fusion (e.g., top 2*over_retrieve_k)
                 num_sparse_for_fusion = self.over_retrieve_k * 2
                 for rank, doc_index in enumerate(sparse_ranked_indices[:num_sparse_for_fusion]):
                      # Only add score if the document has a non-zero BM25 score
                      if sparse_scores[doc_index] > 0:
                          rrf_scores[doc_index] = rrf_scores.get(doc_index, 0.0) + 1.0 / (k_rrf + rank)
            elif sparse_scores: # Check if sparse_scores is not empty but length mismatch
                 logger.warning(f"BM25 score count ({len(sparse_scores)}) mismatch with document count ({len(self.all_documents)}). Skipping sparse contribution to RRF.")

            # Sort documents based on RRF score
            sorted_indices_by_rrf = sorted(rrf_scores.keys(), key=lambda idx: rrf_scores[idx], reverse=True)

            # Get top documents based on RRF ranking
            # Retrieve slightly more than needed for reranking to handle potential duplicates?
            top_indices_for_reranking = sorted_indices_by_rrf[:self.over_retrieve_k]
            docs_for_reranking = [self.all_documents[idx] for idx in top_indices_for_reranking]
            logger.info(f"RRF selected {len(docs_for_reranking)} candidates for reranking.")

            # --- Rerank the combined results --- 
            logger.info("Reranking the fused results...")
            final_documents = self.rerank_documents(query, docs_for_reranking)

            logger.info("--- Hybrid Document Retrieval Complete --- ")
            return final_documents

        except Exception as exc:
            logger.exception(f"Failed during hybrid document retrieval: {exc}") # Use exception logger
            # raise # Optionally re-raise or return empty
            return []

    def _build_final_prompt(self, question: str, documents: List[Document]) -> str:
        """Builds the final prompt for the LLM using retrieved documents and history."""
        # Format retrieved documents
        context = "\n\n".join([f"Source {i+1} ({doc.metadata.get('source', 'Unknown')}):\n{doc.page_content}" for i, doc in enumerate(documents)])

        # Simplified history integration (consider more sophisticated methods)
        history_str = "\n".join([f"Human: {h['human']}\nAI: {h['ai']}" for h in self.conversation_history])

        # Basic prompt template - adjust as needed for the specific LLM
        # This template assumes the LLM understands the structure.
        # For instruct models like Llama3-Instruct, we might use apply_chat_template later.
        prompt = (
            f"You are a helpful assistant specializing in Women's Reproductive Healthcare. "
            f"Use the following context and conversation history to answer the user's question. "
            f"Cite the sources used in your answer (e.g., [Source 1], [Source 2]). "
            f"If the context doesn't provide the answer, state that clearly.\n\n"
            f"Conversation History:\n"
            f"---\n"
            f"{history_str if history_str else 'No history yet.'}\n"
            f"---\n\n"
            f"Context Documents:\n"
            f"---\n"
            f"{context}\n"
            f"---\n\n"
            f"User Question: {question}\n\n"
            f"Answer:"
        )
        return prompt

    # --- NEW generate_response_stream using local LLM (Outputs SSE) ---
    async def generate_response_stream(self, question: str, documents: List[Document]) -> AsyncGenerator[str, None]:
        """
        Generates a response stream locally using the loaded LLM, tokenizer, and streamer.
        Applies chat template if configured.
        Yields Server-Sent Events (SSE) formatted strings.
        """
        if not self.llm_model or not self.llm_tokenizer:
            logger.error("LLM model or tokenizer not loaded. Cannot generate response.")
            error_payload = json.dumps({"error": "LLM not initialized"})
            yield f"event: error\ndata: {error_payload}\n\n"
            return

        # 1. Build the prompt or message list
        final_prompt = self._build_final_prompt(question, documents)

        # 2. Format for model (apply chat template if needed)
        if settings.LLM_APPLY_CHAT_TEMPLATE:
            # Convert basic prompt structure to messages for chat template
            # This is a basic example, adjust based on how _build_final_prompt structures info
            # TODO: Refine message formatting based on exact needs and template structure
            context_docs_str = "\n".join([f"Source {i+1} ({doc.metadata.get('source', 'Unknown')}): {doc.page_content}" for i, doc in enumerate(documents)])
            system_message = (
                 f"You are a helpful assistant specializing in Women's Reproductive Healthcare. "
                 f"Use the following context to answer the user's question. Cite sources (e.g., [Source 1]). "
                 f"If the context doesn't provide the answer, say so.\n\nContext:\n{context_docs_str}"
            )
            # Construct message list including history
            messages = [{"role": "system", "content": system_message}]
            for turn in self.conversation_history:
                messages.append({"role": "user", "content": turn['human']})
                messages.append({"role": "assistant", "content": turn['ai']})
            messages.append({"role": "user", "content": question})

            try:
                model_input_text = self.llm_tokenizer.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True
                )
                logger.info("Applied chat template for model input.")
            except Exception as e:
                logger.error(f"Failed to apply chat template: {e}. Falling back to basic prompt.")
                model_input_text = final_prompt # Fallback
        else:
            model_input_text = final_prompt
            logger.info("Using basic prompt string for model input.")

        # 3. Tokenize input
        # Important: Set return_tensors="pt" and send to the model's device
        # Use the device where the first parameter resides if using device_map="auto"
        model_device = self.llm_model.device
        inputs = self.llm_tokenizer(model_input_text, return_tensors="pt").to(model_device)

        # 4. Set up streamer and generation thread
        streamer = TextIteratorStreamer(
            self.llm_tokenizer,
            skip_prompt=True,
            skip_special_tokens=True
        )

        generation_kwargs = dict(
            inputs, # Pass tokenized inputs directly
            streamer=streamer,
            max_new_tokens=settings.LLM_MAX_NEW_TOKENS,
            do_sample=True,
            temperature=settings.LLM_TEMPERATURE,
            top_p=settings.LLM_TOP_P,
            pad_token_id=self.llm_tokenizer.eos_token_id # Use EOS token for padding during generation
        )

        # Run generation in a separate thread
        thread = Thread(target=self.llm_model.generate, kwargs=generation_kwargs)
        thread.start()
        logger.info("Started generation thread.")

        # 5. Yield SSE formatted tokens from streamer
        generated_tokens = 0
        full_response_for_history = "" # Buffer to store the complete response for history
        try:
            for new_text in streamer:
                if new_text:
                    generated_tokens += 1
                    full_response_for_history += new_text # Append to buffer
                    # Format as SSE token event
                    token_payload = json.dumps({'token': new_text})
                    yield f"event: token\ndata: {token_payload}\n\n"
                    await asyncio.sleep(0.01)
            thread.join()
            logger.info(f"Generation finished. Streamed {generated_tokens} tokens.")
            
            # ---- Append Sources (Example - if needed) ----
            # This part depends on whether you want sources appended by RAGBot
            # or handled entirely by the caller (Django view)
            # If RAGBot appends, it should yield a final chunk or specific event
            sources_text = ""
            sources = set()
            if documents:
                for doc in documents:
                    if hasattr(doc, 'metadata') and 'source' in doc.metadata:
                        filename_with_ext = doc.metadata['source']
                        filename_without_ext, _ = os.path.splitext(filename_with_ext)
                        sources.add(filename_without_ext)
            if sources:
                sources_text = "\n\n---\n**Sources:**\n" + "\n".join(f"- {s}" for s in sorted(list(sources)))
                # Option 1: Append sources to the last token event (might be complex)
                # Option 2: Yield a separate SSE event for sources
                sources_payload = json.dumps({'sources': sorted(list(sources))})
                yield f"event: sources\ndata: {sources_payload}\n\n"
                logger.info("Yielded sources event.")
                # Append sources to the text stored for history
                full_response_for_history += sources_text
            # -----------------------------------------------

        except Exception as e:
             logger.exception("Error during token streaming or generation thread.")
             error_payload = json.dumps({"error": f'Error during generation: {e}'})
             yield f"event: error\ndata: {error_payload}\n\n"
        finally:
            # Ensure thread is joined even if errors occurred in the loop
            if thread.is_alive():
                thread.join()
            # Yield the final SSE end event
            yield f"event: end\ndata: {{}}\n\n"
            logger.info("Stream generation complete, yielded end event.")
            # Add interaction to history *after* full response is generated
            # Note: Caller (rag_server?) might be a better place to handle history
            if question and full_response_for_history: # Only add if we have both
                 self.add_to_history(question, full_response_for_history)

    # Method to add interaction to history (called after generation completes)
    def add_to_history(self, user_input: str, ai_response: str):
        """Adds the latest interaction to the conversation history."""
        self.conversation_history.append({"human": user_input, "ai": ai_response})
        # Trim history if it exceeds the maximum length
        if len(self.conversation_history) > self.max_history_length:
            self.conversation_history = self.conversation_history[-self.max_history_length:]
            logger.info(f"Trimmed conversation history to last {self.max_history_length} turns.")

# Note: process_query is NOT used for streaming, need a separate flow

# process_query remains for non-streaming endpoint








