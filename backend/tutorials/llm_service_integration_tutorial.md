# Backend Tutorial: Integrating a Separate LLM Inference Service

This tutorial explains the architecture chosen for integrating the Large Language Model (LLM) inference with the main Django web application API.

## 1. The Problem: LLMs are Resource-Intensive

-   LLMs like Llama 3.2 require significant computational resources (RAM for model weights, potentially powerful GPUs with substantial VRAM for efficient inference).
-   Running this heavy computation directly within the same process as the Django web server (which handles user authentication, database interactions, API requests/responses) can lead to several problems:
    -   **Resource Starvation:** The LLM might consume all available RAM or GPU, making the web server unresponsive to user requests.
    -   **Blocking:** Synchronous LLM inference calls within a Django view would block that web worker, preventing it from handling other requests until inference is complete (which can take seconds).
    -   **Scalability Issues:** Scaling the web server (e.g., running more Django workers) would also mean scaling the LLM resource usage, which might not be necessary or efficient.
    -   **Deployment Complexity:** Deploying Django (typically on CPU instances) and managing GPU dependencies/drivers in the same environment can be complex.

## 2. The Solution: Separate Inference Service

To address these issues, we adopt a common pattern: separating the LLM inference into its own dedicated service.

-   **Django API (`backend/api/`):**
    -   **Role:** Handles web requests, user authentication (JWT), database interactions (saving chat sessions, interactions), business logic orchestration.
    -   **Technology:** Django + Django REST Framework.
    -   **Interaction with LLM:** When processing a chat message (`/api/chat/`), instead of running the LLM code directly, it makes an **HTTP request** to the separate LLM Inference Service.
-   **LLM Inference Service (`backend/llm_service/`):**
    -   **Role:** Dedicated solely to loading the LLM, managing GPU/CPU resources, and performing text generation inference.
    -   **Technology:** FastAPI + Uvicorn (lightweight, ASGI-compatible, good for ML serving) + `transformers`/`torch` (for running the LLM).
    -   **Interaction:** Exposes a simple HTTP endpoint (e.g., `/generate`) that accepts a prompt and returns the generated text.

## 3. Communication Flow

```mermaid
graph LR
    A[Frontend UI (Browser)] -- HTTP /api/chat/ --> B(Django API Server);
    B -- HTTP /generate --> C(FastAPI LLM Service);
    C -- LLM Inference --> D{LLM Model (on GPU/CPU)};
    D -- Response --> C;
    C -- HTTP Response --> B;
    B -- Save Interaction --> E[Database];
    B -- HTTP Response --> A;
```

1.  The **Frontend** sends the user's message via `fetchWithAuth` to the **Django API** (`/api/chat/`).
2.  The **Django API view** (`process_chat_message`) authenticates the user, finds/creates the `ChatSession`, saves the initial `Interaction` (query), and then makes an internal HTTP POST request (using the `requests` library) to the **FastAPI LLM Service** (`http://127.0.0.1:8001/generate`), sending the prompt.
3.  The **FastAPI Service** receives the request, uses its loaded LLM pipeline (running on the appropriate device - CUDA/MPS/CPU) to generate the response.
4.  The **FastAPI Service** sends the generated text back in an HTTP response to the **Django API**.
5.  The **Django API view** receives the response, saves the `final_response_text` to the `Interaction` record in the database, and sends the message back to the **Frontend**.

## 4. Benefits

-   **Robustness:** Prevents the LLM crashing or slowing down the main web application.
-   **Scalability:** API servers and LLM servers can be scaled independently.
-   **Resource Optimization:** LLM runs on appropriate hardware (GPU nodes), while the API runs efficiently on CPU instances.
-   **Maintainability:** Cleaner separation between web logic and complex ML inference code.
-   **Technology Choice:** Allows using the best tools for each job (Django for web, FastAPI/`transformers` for ML serving).

## 5. Development vs. Production

-   **Development:** We run two separate processes using the development servers (`manage.py runserver` for Django, `python llm_service/server.py` or `uvicorn llm_service.server:app` for FastAPI) to simulate this separation.
-   **Production:** The Django app would run under a WSGI server (e.g., Gunicorn) potentially behind a reverse proxy (like Nginx or Apache). The FastAPI app would run under an ASGI server (e.g., Uvicorn, possibly managed by Gunicorn) on a dedicated machine (likely with GPUs). The internal communication would happen over the network between these production services.

This architecture, while involving an extra internal network call, provides a much more stable, scalable, and maintainable foundation for applications integrating heavy ML models. 