# backend/llm_service/server.py

import os
import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline, TextIteratorStreamer
from threading import Thread
import logging
import json
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---
MODEL_NAME = "meta-llama/Llama-3.2-3B-Instruct"
# Consider making PORT configurable via environment variable
PORT = 8001 
# Consider max tokens, temperature etc. configurable
MAX_NEW_TOKENS = 512

# --- Device Setup ---
def get_device():
    if torch.cuda.is_available():
        logger.info("CUDA device detected. Using GPU.")
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        logger.info("MPS device detected (Apple Silicon). Using GPU.")
        return torch.device("mps")
    else:
        logger.info("No GPU detected. Using CPU.")
        return torch.device("cpu")

device = get_device()

# --- Model Loading --- 
# Use a global variable to hold the loaded pipeline
# This ensures the model is loaded only once on startup
llm_pipeline = None

def load_model():
    global llm_pipeline
    if llm_pipeline is None:
        logger.info(f"Loading model: {MODEL_NAME}...")
        try:
            # Check if login is needed (e.g., for gated models like Llama)
            # You might need to run `huggingface-cli login` first or pass token
            # token = os.environ.get("HF_TOKEN") # Example: load token from env
            tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            model = AutoModelForCausalLM.from_pretrained(
                MODEL_NAME,
                torch_dtype=torch.bfloat16, # Use bfloat16 for efficiency if supported
                device_map="auto", # Let accelerate handle device placement
                # use_auth_token=token # Pass token if needed
            )
            # Set pad token if missing (common for Llama)
            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token
            
            llm_pipeline = pipeline(
                "text-generation",
                model=model,
                tokenizer=tokenizer,
                # device=device, # device_map="auto" handles this
                max_new_tokens=MAX_NEW_TOKENS,
                # Add other pipeline params like temperature if desired
            )
            logger.info("Model loaded successfully.")
        except Exception as e:
            logger.error(f"Error loading model: {e}", exc_info=True)
            # Decide how to handle model loading failure - maybe exit?
            raise RuntimeError(f"Failed to load LLM model: {e}")
    return llm_pipeline

# --- FastAPI App ---
app = FastAPI()

class GenerationRequest(BaseModel):
    prompt: str
    # Add other potential params: max_tokens, temperature, etc.

@app.on_event("startup")
async def startup_event():
    # Load the model when the server starts
    load_model()

# --- Streaming Generator --- 
async def stream_generator(prompt: str):
    global llm_pipeline
    if llm_pipeline is None:
        logger.error("Model not loaded.")
        yield f"event: error\ndata: {json.dumps({'error': 'Model not ready'})}\n\n"
        return

    logger.info(f"Received streaming request with prompt: '{prompt[:50]}...'" )

    try:
        streamer = TextIteratorStreamer(llm_pipeline.tokenizer, skip_prompt=True, skip_special_tokens=True)
        messages = [{"role": "user", "content": prompt}]
        formatted_prompt = llm_pipeline.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        generation_kwargs = dict(
            text_inputs=formatted_prompt,
            streamer=streamer,
            max_new_tokens=MAX_NEW_TOKENS
        )
        thread = Thread(target=llm_pipeline, kwargs=generation_kwargs)
        thread.start()

        generated_tokens = 0
        for token_text in streamer:
            if token_text:
                generated_tokens += 1
                yield f"data: {json.dumps({'token': token_text})}\n\n"
                await asyncio.sleep(0.01) 

        thread.join()
        logger.info(f"Streaming finished. Generated {generated_tokens} tokens.")

    except Exception as e:
        logger.error(f"Error during streaming generation: {e}", exc_info=True)
        yield f"event: error\ndata: {json.dumps({'error': f'Error during generation: {e}'})}\n\n"
    finally:
        yield "event: end\ndata: {}\n\n"

@app.post("/generate")
async def generate_stream(request: GenerationRequest):
    return StreamingResponse(stream_generator(request.prompt), media_type="text/event-stream")

# --- Run (for direct execution) ---
if __name__ == "__main__":
    import uvicorn
    # Load model before starting server (optional, @app.on_event does this too)
    # load_model() 
    logger.info(f"Starting LLM service on port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT) 