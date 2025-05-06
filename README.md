# WHIRL - Women's Health Information Retrieval with LLM

WHIRL is a specialized question-answering system designed to provide accurate, evidence-based information about women's health topics. The system is built on a foundation of Large Language Model (LLM) technology enhanced with Retrieval-Augmented Generation (RAG) capabilities, allowing it to provide medically accurate responses grounded in trusted sources.

## Project Overview

This application consists of three main components:

1. **Frontend**: Next.js web application providing an intuitive chat interface
2. **Backend**: Django application handling authentication, chat session management, and API endpoints
3. **LLM Service**: FastAPI-based service implementing RAG capabilities with the Llama 3.2 model family

## Features

- Real-time token streaming responses
- Custom RAG implementation with hybrid search (vector + BM25)
- JWT-based authentication
- Chat history management
- Dark/light theme support
- Mobile-responsive design

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL (optional, SQLite works for development)

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/iamravis/WHIRL.git
   cd WHIRL
   ```

2. **Set up the environment variables**

   Create `.env` files in the root, backend, and backend/llm_service directories based on the provided examples.

3. **Install backend dependencies**

   ```bash
   cd backend
   pip install -r requirements.txt
   python manage.py migrate
   ```

4. **Install frontend dependencies**

   ```bash
   cd ..  # Back to root
   npm install
   ```

5. **Run the services**

   In separate terminals:

   **Django Backend**
   ```bash
   cd backend
   python -m uvicorn core.asgi:application --host 127.0.0.1 --port 8000 --reload
   ```

   **RAG Service**
   ```bash
   cd backend/llm_service
   python -m uvicorn rag_server:app --host 0.0.0.0 --port 8002 --reload
   ```

   **Frontend**
   ```bash
   npm run dev
   ```

6. **Access the application**

   Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

## Documentation

For detailed documentation, please refer to the [PRD.md](PRD.md) file.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 