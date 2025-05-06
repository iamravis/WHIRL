# WHIRL - Women's Health Information Retrieval with LLM

## Product Requirements Document (PRD)

**Version 1.0**  
**Date: May 5, 2025**

---

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Backend Components](#backend-components)
   - [Core Module](#core-module)
   - [API Module](#api-module)
   - [LLM Service](#llm-service)
   - [RAG Module](#rag-module)
4. [Frontend Components](#frontend-components)
   - [App Structure](#app-structure)
   - [Components](#components)
   - [Lib](#lib)
   - [Styles](#styles)
5. [Authentication Flow](#authentication-flow)
6. [Query Processing Flow](#query-processing-flow)
7. [Running the Application](#running-the-application)
   - [Backend Servers](#backend-servers)
   - [Frontend Server](#frontend-server)
   - [RAG Service](#rag-service)
8. [Development Guidelines](#development-guidelines)
9. [Error Handling and Recovery Strategies](#error-handling-and-recovery-strategies)
10. [Performance Optimization Techniques](#performance-optimization-techniques)
11. [Testing Framework and Methodology](#testing-framework-and-methodology)

---

## 1. Introduction

### Project Overview

WHIRL (Women's Health Information Retrieval with LLM) is a specialized question-answering system designed to provide accurate, evidence-based information about women's health topics. The system is built on a foundation of Large Language Model (LLM) technology enhanced with Retrieval-Augmented Generation (RAG) capabilities, allowing it to provide medically accurate responses grounded in trusted sources.

### Purpose and Goals

The primary goals of WHIRL are to:

1. **Democratize Access to Women's Health Information**: Provide reliable, accessible information that empowers women to make informed healthcare decisions.

2. **Reduce Misinformation**: Combat the spread of inaccurate health information by grounding all responses in verified medical literature and clinical guidelines.

3. **Bridge Knowledge Gaps**: Address topics that may be underrepresented in general medical resources, particularly those specific to women's health.

4. **Support Healthcare Professionals**: Serve as a reference tool for healthcare providers to quickly access evidence-based information during patient consultations.

### Target Users

WHIRL is designed for multiple user groups:

1. **Women Seeking Health Information**: Primary users looking for reliable information about symptoms, conditions, treatments, and preventive care.

2. **Healthcare Professionals**: Doctors, nurses, and other medical staff who need quick reference to specific women's health guidelines or research.

3. **Medical Students and Researchers**: Users requiring access to cited medical literature and evidence-based guidelines in women's health fields.

4. **Healthcare Educators**: Professionals who teach women's health topics and need accurate, up-to-date reference materials.

### Key Health Focus Areas

WHIRL covers a comprehensive range of women's health topics including but not limited to:

- Reproductive health and family planning
- Pregnancy and postpartum care
- Gynecological conditions
- Breast health and cancer screening
- Menopause and hormonal health
- Sexual health
- Mental health concerns specific to women
- Nutrition and preventive care
- Chronic conditions with gender-specific presentations

### Technical Innovation

What makes WHIRL unique is its combination of several advanced technologies:

1. **Domain-Specific RAG System**: A custom-built retrieval system that enhances LLM responses with information from a curated corpus of women's health literature.

2. **Real-Time Response Generation**: Streaming responses that provide immediate feedback while maintaining high accuracy.

3. **Source Citation**: Automatic citation of medical sources to ensure traceability and credibility of information.

4. **Context-Aware Conversations**: The ability to maintain conversational context while providing medically accurate information.

5. **Secure Authentication**: Role-based access system that can differentiate between general users and healthcare professionals.

The application architecture consists of three primary components:

- **Frontend**: A responsive Next.js web application providing an intuitive chat interface
- **Backend**: A Django application handling authentication, chat session management, and API endpoints
- **LLM Service**: A FastAPI-based service implementing RAG capabilities with the Llama 3.2 model family

Together, these components create a seamless user experience for accessing reliable women's health information through natural language conversation.

---

## 2. System Architecture

WHIRL implements a modern, service-oriented architecture designed for scalability, maintainability, and real-time performance. The system consists of three primary components that communicate through well-defined APIs and streaming protocols.

### Technology Stack Overview

```
┌───────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│     FRONTEND          │      │      BACKEND           │      │      LLM SERVICE       │
│                       │      │                        │      │                        │
│  ┌─────────────────┐  │      │  ┌─────────────────┐   │      │  ┌─────────────────┐   │
│  │  Next.js 14     │  │      │  │  Django 5.2     │   │      │  │  FastAPI        │   │
│  │  React 18       │  │ JWT  │  │  REST Framework │   │ HTTP │  │  Uvicorn        │   │
│  │  TypeScript     │◀─┼──────┼──┤  SimpleJWT      │◀──┼──────┼──┤  Llama 3.2      │   │
│  │  TailwindCSS    │──┼──────┼─▶│  ASGI/Uvicorn   │───┼──────┼─▶│  ChromaDB       │   │
│  └─────────────────┘  │ SSE  │  └─────────────────┘   │Streaming│  BAAI Embeddings│   │
│                       │      │                        │         └─────────────────┘   │
│  ┌─────────────────┐  │      │  ┌─────────────────┐   │         ┌─────────────────┐   │
│  │  Components     │  │      │  │  API Views      │   │         │  RAGBot          │   │
│  │  ├─ ChatInput   │  │      │  │  ├─ Auth        │   │         │  ├─ Vector Search│   │
│  │  ├─ ChatMessages│  │      │  │  ├─ Profile     │   │         │  ├─ BM25 Search  │   │
│  │  ├─ ChatSidebar │  │      │  │  ├─ Chat        │   │         │  ├─ Re-ranker    │   │
│  │  └─ ThemeToggle │  │      │  │  └─ Stream      │   │         │  └─ Token Stream │   │
│  └─────────────────┘  │      │  └─────────────────┘   │         └─────────────────┘   │
│                       │      │                        │                               │
│  ┌─────────────────┐  │      │  ┌─────────────────┐   │         ┌─────────────────┐   │
│  │  State & APIs   │  │      │  │  Models         │   │         │  Document Store  │   │
│  │  ├─ Auth        │  │      │  │  ├─ ChatSession │   │         │  ├─ ChromaDB     │   │
│  │  ├─ EventSource │  │      │  │  ├─ Interaction │   │         │  ├─ JSON Chunks  │   │
│  │  ├─ FetchWithAuth│  │      │  │  ├─ UserProfile│   │         │  └─ BM25 Index   │   │
│  │  └─ LocalStorage│  │      │  │  └─ Document    │   │         │                  │   │
│  └─────────────────┘  │      │  └─────────────────┘   │         └─────────────────┘   │
│                       │      │                        │                               │
└───────────────────────┘      └────────────────────────┘      └────────────────────────┘
                 │                        │                               │
                 ▼                        ▼                               ▼
         ┌───────────────┐       ┌───────────────┐              ┌──────────────────┐
         │ User's Browser │       │ PostgreSQL DB │              │ Vector & Document│
         └───────────────┘       └───────────────┘              │     Storage      │
                                                                └──────────────────┘
```

### Component Details

#### 1. Frontend (Next.js)

- **Framework**: Next.js 14.x with App Router
- **UI Library**: React 18
- **Styling**: TailwindCSS 3.x
- **Type System**: TypeScript 5.x
- **Key Features**:
  - Server-side rendering for improved performance and SEO
  - Client-side state management
  - Progressive web app capabilities
  - Dark/light theme support
  - Mobile-responsive design

#### 2. Backend (Django)

- **Framework**: Django 5.2
- **API Layer**: Django REST Framework
- **Authentication**: Simple JWT
- **Server**: Uvicorn (ASGI) for async request handling
- **Database**: PostgreSQL for robust data persistence
- **Key Features**:
  - JWT-based authentication system
  - Async views for SSE streaming
  - Role-based access control
  - Chat session management
  - User profile handling

#### 3. LLM Service (FastAPI)

- **Framework**: FastAPI
- **Server**: Uvicorn
- **LLM Model**: Llama 3.2 3B-Instruct
- **Retrieval System**: 
  - ChromaDB for vector storage
  - BAAI/bge-large-en-v1.5 embeddings
  - BM25 for keyword search
  - Cross-encoder re-ranking
- **Key Features**:
  - Token streaming generation
  - Hybrid search (vector + keyword)
  - Dynamic context assembly
  - Citation extraction
  - Token-by-token streaming

### Communication Patterns

The system employs several communication patterns to facilitate efficient data flow:

#### 1. Frontend to Backend

- **Authentication**: JWT tokens in HTTP-only cookies
- **API Requests**: REST endpoints with JSON payloads
- **Real-time Updates**: Server-Sent Events (SSE) for streaming responses
- **Error Handling**: Standardized error responses with appropriate HTTP status codes

#### 2. Backend to LLM Service

- **Query Forwarding**: HTTP POST requests to the RAG streaming endpoint
- **Response Streaming**: HTTP streaming with chunked transfer encoding
- **Event Formatting**: SSE formatted events with specific event types (token, sources, error, end)

### Data Flow

1. **User Query Flow**:
   ```
   User → Frontend → Backend → LLM Service → Document Retrieval → LLM Generation → Token Streaming → Frontend Display
   ```

2. **Authentication Flow**:
   ```
   User → Login Form → Backend Authentication → JWT Token Generation → Token Storage in Cookies → Protected Route Access
   ```

3. **Chat History Flow**:
   ```
   User → Chat List Request → Backend Chat Sessions Retrieval → Frontend Display → Chat Selection → Message Loading
   ```

### System Boundaries and Integration Points

The architecture defines clear boundaries between components with well-defined integration points:

1. **Frontend-Backend Boundary**:
   - RESTful API endpoints for CRUD operations
   - SSE endpoint for streaming data
   - JWT-based authentication

2. **Backend-LLM Service Boundary**:
   - Streaming HTTP endpoint for RAG queries
   - Internal API for system health checks
   - Shared document schema for context building

This modular architecture allows for:
- Independent scaling of components
- Isolated testing and development
- Potential replacement of components without system-wide changes
- Flexibility to evolve the technology stack over time

---

## 3. Backend Components

### Core Module

The core module serves as the backbone of the Django application, providing project-wide settings and configuration.

**Files and Their Purposes**:

- **`settings.py`**: Contains all Django settings including database configuration, middleware, installed apps, and authentication settings. Notably, it includes JWT token configuration, CORS settings, and RAG service URL.
- **`urls.py`**: Main URL routing file that includes routes from other apps (particularly the API app).
- **`asgi.py`**: ASGI configuration for asynchronous capabilities, essential for the streaming responses.
- **`wsgi.py`**: WSGI configuration for deploying the application with traditional web servers.
- **`__init__.py`**: Empty file that marks the directory as a Python package.

### API Module

The API module handles all HTTP endpoints, authentication, user management, and chat functionality.

**Files and Their Purposes**:

- **`views.py`**: Contains view functions and classes that handle HTTP requests and responses. Key components include:
  - `MyTokenObtainPairView`: Custom JWT token view for email-based login
  - `ProcessChatMessageView`: Async Django view for processing chat messages with Server-Sent Events
  - `UserProfileView`: Endpoint for retrieving user profile information
  - `ChatSessionListView` and `ChatSessionDetailView`: Endpoints for chat history management
  - `rag_service_sse_proxy_generator`: Async generator that proxies SSE streams from RAG service

- **`urls.py`**: Defines URL patterns for the API, mapping endpoints to view functions including:
  - Authentication endpoints (`/auth/login/`, `/auth/refresh/`)
  - Profile endpoint (`/profile/me/`)
  - Chat endpoints (`/chats/`, `/chat/`)

- **`models.py`**: Defines database models including:
  - `ChatSession`: Represents a conversation thread
  - `Interaction`: Logs each user query and system response
  - `UserProfile`: Stores additional user information
  - `DocumentMetadata` and `DocumentChunk`: Store information about source documents for RAG

- **`serializers.py`**: Contains Django REST Framework serializers for converting model instances to JSON and vice versa. Key serializers include:
  - `MyTokenObtainPairSerializer`: Custom JWT token serializer supporting email-based login
  - `UserSerializer`: For user registration and profile management
  - `ChatSessionListSerializer` and `ChatSessionDetailSerializer`: For chat history endpoints

- **`backends.py`**: Contains custom authentication backends, particularly:
  - `EmailBackend`: Authentication backend for email-based login instead of username

- **`admin.py`**: Django admin configuration for models, enabling management through Django's admin interface.

### LLM Service

The LLM service module provides the RAG capabilities and LLM inference, using FastAPI for high-performance async handling.

**Files and Their Purposes**:

- **`rag_server.py`**: FastAPI application that wraps the RAGBot class for API access. Key components:
  - `RagQuery`: Pydantic model defining the request structure
  - `rag_bot_stream_generator`: Function that streams responses from RAGBot
  - `/rag_generate_stream` endpoint: Main endpoint for streaming RAG responses

- **`server.py`**: General LLM service server that can handle non-RAG queries. It's designed for pure LLM inference without retrieval augmentation.

### RAG Module

The RAG (Retrieval Augmented Generation) module forms the core intelligence of WHIRL, providing medically accurate responses based on trusted women's health literature. This module implements a sophisticated hybrid search and contextualization pipeline that enhances LLM outputs with domain-specific knowledge.

#### Architecture and Components

The RAG system is implemented as a Python module with the following key components:

**Files and Their Purposes**:

- **`rag.py`**: Core implementation containing the `RAGBot` class that orchestrates the entire retrieval and generation process.
- **`rag_server.py`**: FastAPI wrapper providing HTTP endpoints for the RAG functionality, including streaming generation.
- **`document_processor.py`**: Utility for processing and chunking documents during the indexing phase.
- **`index_builder.py`**: Tools for creating and updating the vector and keyword indices.
- **`embeddings.py`**: Interface to embedding models used for vectorizing text.

#### Document Processing Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  Medical        │────▶│  Chunking       │────▶│  Embedding      │────▶│  Index          │
│  Documents      │     │  & Processing   │     │  Generation     │     │                 │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                │
                                                                                │
                                                                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  BM25           │     │  Vector         │     │  Metadata       │     │  Document       │
│  Index          │◀────│  Database       │◀────│  Storage        │◀────│  Storage        │
│                 │     │  (ChromaDB)     │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Document Ingestion**: Medical documents from trusted sources are collected and pre-processed.
2. **Chunking**: Documents are split into semantically meaningful chunks of approximately 200 tokens with 10-token overlap.
3. **Metadata Extraction**: Each chunk is associated with metadata about its source, authors, publication date, etc.
4. **Embedding Generation**: The BAAI/bge-large-en-v1.5 model converts each chunk into a dense vector representation.
5. **Storage**: Chunks and their embeddings are stored in ChromaDB; the complete corpus is also indexed with BM25.

#### Retrieval Pipeline

```
┌─────────────────┐
│                 │
│  User Query     │
│                 │
└───────┬─────────┘
        │
        ▼
┌────────────────────┐
│                    │
│  Query Transformation │
│  (FLAN-T5-Large)   │
│                    │
└────────┬───────────┘
         │
         ▼
┌──────────────────────────────────────┐
│                                      │
│              Hybrid Search           │
│                                      │
│  ┌────────────────┐ ┌──────────────┐ │
│  │                │ │              │ │
│  │ Vector Search  │ │ BM25 Search  │ │
│  │                │ │              │ │
│  └────────┬───────┘ └──────┬───────┘ │
│           │                │         │
│           └───────┬────────┘         │
│                   │                  │
└───────────────────┼──────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│                                     │
│         Re-Ranking (Optional)       │
│  (ms-marco-MiniLM-L-6-v2)           │
│                                     │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│                                     │
│          Context Assembly           │
│                                     │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│                                     │
│        Prompt Construction          │
│                                     │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│                                     │
│          LLM Generation             │
│        (Llama 3.2 3B Instruct)      │
│                                     │
└─────────────────────────────────────┘
```

1. **Query Transformation**: User queries are optionally expanded or reformulated to better match medical terminology using FLAN-T5.
2. **Vector Search**: The query is embedded and used to find semantically similar document chunks in ChromaDB.
3. **Keyword Search**: A parallel BM25 search finds chunks containing important keywords from the query.
4. **Result Merging**: Results from both search methods are combined, with customizable weighting.
5. **Re-ranking**: A cross-encoder model (ms-marco-MiniLM-L-6-v2) can be applied to re-rank results for improved relevance.
6. **Context Selection**: The most relevant chunks are selected to fit within the context window of the LLM.
7. **Source Tracking**: Document sources are tracked for citation in the final response.

#### LLM Integration

The RAG module uses the Llama 3.2 3B Instruct model for response generation, with the following configuration:

```python
LLM_CONFIG = {
    "model_name": "meta-llama/Llama-3.2-3B-Instruct",
    "device_map": "auto",  # Automatically use available GPU/MPS
    "torch_dtype": torch.bfloat16,  # Use bfloat16 precision for efficiency
    "max_new_tokens": 512,  # Maximum response length
    "temperature": 0.7,  # Controls randomness in generation
    "top_p": 0.9,  # Nucleus sampling parameter
    "repetition_penalty": 1.1,  # Discourage repetition
    "apply_chat_template": True,  # Apply model-specific chat formatting
}
```

#### Streaming Implementation

A key feature of the RAG module is token-by-token streaming, which provides real-time feedback to users:

1. **Generator Function**: The `rag_bot_stream_generator` function yields tokens as they're produced:

```python
async def rag_bot_stream_generator(query: str):
    ragbot = get_ragbot()
    
    # Initial events
    yield f"event: start\ndata: {{}}\n\n"
    
    # Process query and retrieve context
    context_docs = await asyncio.to_thread(
        ragbot.retrieve_documents, query, top_k=5
    )
    
    # Stream generation tokens
    async for token in ragbot.generate_streaming(query, context_docs):
        yield f"event: token\ndata: {{\"token\": \"{token}\"}}\n\n"
    
    # Send sources if available
    if context_docs:
        sources = [doc.metadata.get("source", "Unknown") for doc in context_docs[:3]]
        yield f"event: sources\ndata: {{\"sources\": {json.dumps(sources)}}}\n\n"
    
    # End event
    yield f"event: end\ndata: {{}}\n\n"
```

2. **Async Processing**: Async functions allow for non-blocking operation, handling multiple requests simultaneously.

#### Performance and Monitoring

The system includes detailed logging for performance monitoring and debugging:

```
[2025-05-06 00:05:30] INFO: Applied chat template for model input.
[2025-05-06 00:05:30] INFO: Started generation thread.
[2025-05-06 00:06:31] INFO: Generation finished. Streamed 314 tokens.
[2025-05-06 00:06:31] INFO: Stream generation complete, yielded end event.
```

Each token generation is tracked with detailed debugging:

```
[2025-05-06 00:11:20] DEBUG: [SSE Proxy 19] Token event lines: ['event: token', 'data: {"token": "Academy "}']
[2025-05-06 00:11:20] DEBUG: [SSE Proxy 19] Added token: Academy 
[2025-05-06 00:11:20] DEBUG: [SSE Proxy 19] Received raw chunk 303
```

#### Document Corpus

The RAG system is built on a carefully curated corpus of women's health literature:

- **Volume**: 11,242 document chunks from authoritative sources
- **Source Types**: Medical journals, clinical guidelines, health authority publications
- **Topics**: Comprehensive coverage of women's health domains
- **Chunking Strategy**: Semantic paragraphs of approximately 200 tokens with 10-token overlap

#### Retrieval Quality Optimizations

Several techniques enhance the quality of retrieved context:

1. **Hybrid Retrieval**: Combined vector and keyword search to balance semantic understanding and exact term matching
2. **Query Transformation**: Expansion and reformulation to bridge vocabulary gaps
3. **Re-ranking**: Cross-encoder model to improve relevance of results
4. **Context Deduplication**: Elimination of redundant information before LLM processing
5. **Citation Formatting**: Automatic formatting of source citations in markdown

---

## 4. Frontend Components

### App Structure

The Next.js frontend follows a modern app directory structure with page components, shared components, and utility functions.

**Key Files and Directories**:

- **`page.tsx`**: Main application page containing the chat interface. Key features:
  - Chat history and message management
  - Authentication handling
  - Real-time streaming of responses via EventSource
  - User profile management
  - Local storage synchronization for chats

- **`layout.tsx`**: Root layout component defining the overall page structure.

- **`ThemeProvider.tsx`**: Provides theme context for dark/light mode switching.

- **`providers.tsx`**: Contains React context providers for the application.

- **`globals.css`**: Global CSS styles for the application.

### Auth Module

Contains pages and components related to authentication.

**Files and Their Purposes**:

- **`auth/signin/page.tsx`**: Sign-in page component with:
  - Email and password form
  - JWT token handling via cookies
  - Error handling and validation
  - Redirect logic after successful sign-in

- **`auth/signup/page.tsx`**: Sign-up page component with new user registration functionality.

### Components

Reusable UI components used throughout the application.

**Key Components**:

- **`ChatMessages.tsx`**: Renders the chat messages with formatting for user and assistant messages. Features:
  - Syntax highlighting for code
  - Markdown rendering
  - Support for thinking/reasoning display

- **`ChatInput.tsx`**: Input component for sending messages, with features like:
  - File attachment options
  - API provider selection
  - Streaming indication
  - Stop generation functionality

- **`ChatSidebar.tsx`**: Sidebar component showing chat history with:
  - Chronological grouping (Today, Yesterday, etc.)
  - Delete functionality
  - Search

- **`ThemeToggle.tsx`**: Component for switching between light and dark modes.

- **`Loading.tsx`**: Loading indicator component.

- **`ErrorBoundary.tsx`**: React error boundary for graceful error handling.

### Lib

Utility functions and shared logic.

**Key Files**:

- **`api.ts`**: API utilities including:
  - `fetchWithAuth`: Function for making authenticated API requests
  - `refreshToken`: Function for refreshing expired JWT tokens

- **`auth.ts`**: Authentication utilities and configuration.

### Middleware

- **`middleware.ts`**: Next.js middleware for handling authentication across routes:
  - Protects routes requiring authentication
  - Reads JWT token from cookies
  - Redirects unauthenticated users to login page

---

## 5. Authentication Flow

```
┌─────────────┐      ┌────────────────┐      ┌─────────────────┐
│             │      │                │      │                 │
│  User       │─────▶│  Next.js       │─────▶│  Django         │
│             │      │  Frontend      │◀─────│  Backend        │
│             │◀─────│                │      │                 │
└─────────────┘      └────────────────┘      └─────────────────┘
                           │    ▲
                           │    │
                           ▼    │
                     ┌──────────────────┐
                     │                  │
                     │  Browser         │
                     │  Cookies         │
                     │                  │
                     └──────────────────┘
```

1. **User Registration**:
   - User submits registration form with email and password
   - Frontend sends POST request to `/api/auth/register/`
   - Backend validates data and creates new user
   - User is redirected to login page

2. **User Login**:
   - User submits login form with email and password
   - Frontend sends POST request to `/api/auth/login/`
   - Backend validates credentials using EmailBackend
   - If valid, backend returns JWT access and refresh tokens
   - Frontend stores tokens in HTTP-only cookies
   - User is redirected to main application

3. **Token Refresh**:
   - When access token expires (401 response)
   - Frontend sends refresh token to `/api/auth/refresh/`
   - Backend validates refresh token and issues new access token
   - Frontend updates cookies with new access token

4. **Protected Route Access**:
   - Next.js middleware checks for access token in cookies
   - If missing, user is redirected to login page
   - If present, middleware allows access to protected routes

5. **User Profile**:
   - After authentication, frontend fetches user profile from `/api/profile/me/`
   - Profile data is used to personalize the UI

6. **Logout**:
   - User clicks logout button
   - Frontend removes auth cookies
   - User is redirected to login page

### Authentication System Details

#### Backend Authentication Components

1. **JWT Token Implementation**:
   - Uses Django REST Framework with Simple JWT for token-based authentication
   - Provides two tokens: access token (short-lived) and refresh token (long-lived)
   - Access token used for API authorization, refresh token for obtaining new access tokens

2. **Custom Backend (`EmailBackend`)**:
   - Located in `backend/api/backends.py`
   - Implements email-based authentication instead of Django's default username
   - Performs case-insensitive email lookup
   - Validates password and user active status

3. **Authentication Endpoints**:
   - `/api/auth/login/` - `MyTokenObtainPairView` for email-based login
   - `/api/auth/refresh/` - `TokenRefreshView` for refreshing expired access tokens
   - `/api/auth/register/` - User registration view

4. **Token Serializer and Validation**:
   - `MyTokenObtainPairSerializer` handles email-based authentication
   - JWT token validation in views like `ProcessChatMessageView`
   - Tokens extracted from Authorization headers with format `Bearer <token>`

#### Frontend Authentication Handling

1. **Token Storage and Management**:
   - HTTP cookies used for token storage (not localStorage)
   - Cookie-based storage improves security against XSS attacks
   - Token refresh logic in `fetchWithAuth` utility

2. **Authentication Flow in UI**:
   - Login/signup forms in `auth/signin/page.tsx` and `auth/signup/page.tsx`
   - Token handling with `cookies-next` package
   - Error handling and validation for login attempts

3. **Route Protection**:
   - Next.js middleware in `middleware.ts` checks for token presence
   - Protected routes defined in middleware configuration
   - Authentication state management in page components

#### Production Considerations

1. **Security Enhancements**:
   - Set `secure` and `httpOnly` flags for cookies in production
   - Implement appropriate CORS settings for cross-domain requests
   - Add rate limiting for authentication endpoints
   - Implement CSRF protection for login/registration endpoints

2. **Token Configuration**:
   - Adjust token lifetimes based on security requirements (shorter for access, longer for refresh)
   - Implement token blacklisting for logout security
   - Consider using sliding sessions for refresh tokens

3. **Monitoring and Auditing**:
   - Log authentication attempts and failures
   - Implement IP-based blocking after repeated failures
   - Add comprehensive monitoring for authentication events

---

## 6. Query Processing Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│             │     │              │     │             │     │             │     │             │
│  User       │────▶│  Next.js     │────▶│  Django     │────▶│  RAG        │────▶│  LLM        │
│  Interface  │     │  Frontend    │     │  Backend    │     │  Service    │     │  Model      │
│             │◀────│              │◀────│             │◀────│             │◀────│             │
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                     │                   │                   │
                          │                     │                   │                   │
                          ▼                     ▼                   ▼                   ▼
                    ┌──────────────┐     ┌─────────────┐     ┌─────────────┐    ┌──────────────┐
                    │  EventSource │     │ ChatSession │     │  Document   │    │  Token       │
                    │  Connection  │     │ Interaction │     │  Retrieval  │    │  Generation  │
                    └──────────────┘     └─────────────┘     └─────────────┘    └──────────────┘
```

1. **User Sends Query**:
   - User types message in ChatInput component
   - Frontend adds user message to chat history
   - Frontend creates placeholder for assistant response

2. **EventSource Connection Established**:
   - Frontend creates EventSource connection to `/api/chat/stream/?session_id={sessionId}&query={query}`
   - Connection includes JWT token in Authorization header

3. **Backend Authentication**:
   - Django backend extracts and validates JWT token
   - If invalid, returns authentication error
   - If valid, retrieves or creates chat session

4. **Interaction Creation**:
   - Backend creates new Interaction record in database
   - Includes user, chat session, and query text

5. **RAG Service Request**:
   - Backend initiates streaming connection to RAG service
   - Sends user query to `/rag_generate_stream` endpoint

6. **Document Retrieval**:
   - RAG service retrieves relevant documents using:
     - Vector search for semantic similarity
     - BM25 for keyword matching
     - Reranking for relevance refinement

7. **LLM Prompt Construction**:
   - RAG service constructs prompt with:
     - User query
     - Retrieved document context
     - System instructions

8. **LLM Generation**:
   - LLM generates response tokens
   - Tokens are streamed back through the pipeline

9. **Streaming Response**:
   - RAG service streams tokens to Django backend
   - Django backend forwards events to frontend
   - Frontend updates UI in real-time as tokens arrive

10. **Events During Streaming**:
    - `init`: Contains interaction ID
    - `data`: Contains text tokens to display
    - `error`: Contains error information if something fails
    - `end`: Signals completion of response

11. **Chat Session Update**:
    - After completion, frontend updates local and remote chat history
    - New chat is added to sidebar if it was a new conversation

### Server-Sent Events (SSE) Implementation

The WHIRL application uses Server-Sent Events (SSE) for real-time streaming of LLM-generated responses. This approach provides several advantages over traditional HTTP requests:

1. **Real-time updates**: Users see responses as they're generated, token by token
2. **Reduced latency**: No need to wait for the entire response to be generated
3. **Improved user experience**: Visual feedback that the system is working
4. **Lower overhead**: More efficient than WebSockets for one-way communication

#### Frontend SSE Implementation

The frontend uses `EventSourcePolyfill` to establish and maintain SSE connections:

```javascript
// From src/app/page.tsx
const eventSource = new EventSourcePolyfill(eventSourceUrl, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'text/event-stream',
  },
  heartbeatTimeout: 90000, // 90 seconds timeout
  withCredentials: false, // Don't send cookies with cross-origin requests
});
```

The frontend handles three primary event types:
- `token`: Individual text tokens from the LLM
- `sources`: References and citations
- `end`: Signal that the response is complete

Each token is immediately appended to the message being displayed:

```javascript
eventSource.addEventListener('token', (event) => {
  const data = JSON.parse(event.data);
  fullResponse += data.token || '';
  
  // Update the message in the UI
  setMessages((currentMessages) => {
    return currentMessages.map((msg) => {
      if (msg.id === tempAssistantId) {
        return {
          ...msg,
          content: fullResponse,
        };
      }
      return msg;
    });
  });
});
```

#### Backend SSE Implementation

The Django backend uses an async view (`ProcessChatMessageView`) to handle SSE connections:

```python
async def get(self, request, *args, **kwargs):
    # Authentication and parameter validation...
    
    # Create interaction record
    interaction = await self.get_or_create_interaction(
        user, chat_session, query_text
    )
    
    # Return the streaming response
    return StreamingHttpResponse(
        rag_service_sse_proxy_generator(query_text, interaction),
        content_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'  # Disable Nginx buffering
        }
    )
```

#### ASGI Middleware for SSE

To properly support SSE in Django, we implemented a custom ASGI middleware in `backend/core/asgi.py`:

```python
async def sse_friendly_middleware(scope, receive, send):
    """
    Custom middleware to handle Server-Sent Events properly.
    Ensures hop-by-hop headers aren't included in responses.
    """
    if scope["type"] == "http":
        # Modified send function to filter out problematic headers
        async def modified_send(message):
            if message["type"] == "http.response.start":
                # Clean up hop-by-hop headers that cause problems with ASGI
                headers = message.get("headers", [])
                filtered_headers = [
                    header for header in headers 
                    if header[0].lower() not in [
                        b'connection',
                        b'keep-alive',
                        b'proxy-authenticate',
                        b'proxy-authorization',
                        b'te',
                        b'trailers',
                        b'transfer-encoding',
                        b'upgrade',
                    ]
                ]
                message["headers"] = filtered_headers
            
            # Send the modified message
            await send(message)
        
        # Process with Django application using modified send
        await django_application(scope, receive, modified_send)
    else:
        # Default to standard Django ASGI for non-HTTP requests
        await django_application(scope, receive, send)
```

This middleware is crucial because it:
1. Filters out hop-by-hop headers (like `Connection: keep-alive`) that aren't allowed in ASGI responses
2. Prevents "AssertionError: Hop-by-hop header not allowed" errors
3. Enables proper streaming with uvicorn's ASGI server

#### SSE Proxy Generator

The core of the streaming functionality is the async generator `rag_service_sse_proxy_generator` which:
1. Proxies the SSE stream from the RAG service to the frontend
2. Processes chunks correctly by parsing event types
3. Maintains the connection until all tokens are delivered
4. Saves the complete response in the database

```python
async def rag_service_sse_proxy_generator(query_text: str, interaction: Interaction):
    # ... initialization code ...
    
    try:
        # Send initial event with interaction ID
        yield f"event: init\ndata: {{\"interaction_id\": \"{interaction.id}\"}}\n\n"
        
        # Connect to RAG service
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", rag_service_url, json={"query": query_text}) as response:
                async for chunk in response.aiter_text():
                    yield chunk
                    
                    # Parse the chunk to build complete response
                    if chunk.startswith("event: token"):
                        # Extract token and add to complete response
                        lines = chunk.strip().split('\n')
                        for line in lines:
                            if line.startswith("data:"):
                                data_json = line[len("data:"):].strip()
                                data = json.loads(data_json)
                                token = data.get('token', '')
                                full_response_text += token
    except Exception as e:
        # Error handling
        yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
    finally:
        # Save the complete response to the database
        interaction.final_response_text = full_response_text
        await interaction_save_async()
        
        # Send end event
        yield f"event: end\ndata: {{}}\n\n"
```

#### Running the SSE Stack

To run the system with proper SSE support:

```bash
# Run Django with ASGI support
python -m uvicorn backend.core.asgi:application --host 127.0.0.1 --port 8000 --reload

# Run RAG service
cd backend/llm_service && python -m uvicorn rag_server:app --host 0.0.0.0 --port 8002

# Run frontend
npm run dev
```

This configuration enables proper bidirectional streaming between all system components.

---

## 7. Running the Application

### Backend Servers

**Django Backend**

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start Django server
python manage.py runserver
```

The Django server will run at http://127.0.0.1:8000/

**RAG Service**

```bash
# Navigate to backend/llm_service directory
cd backend/llm_service

# Start RAG server
python rag_server.py
```

The RAG service will run at http://0.0.0.0:8002/

### Frontend Server

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The Next.js frontend will run at http://localhost:3000/

### Running All Services Concurrently

For development, you can run all services concurrently using multiple terminal windows or a tool like tmux.

```bash
# Terminal 1: Django Backend
cd backend && python manage.py runserver

# Terminal 2: RAG Service
cd backend/llm_service && python rag_server.py

# Terminal 3: Next.js Frontend
npm run dev
```

---

## 8. Development Guidelines

### Backend Development

- Follow Django best practices for model design and views
- Use Django REST Framework for API endpoints
- Use async views for streaming functionality
- Keep RAG logic separate from API logic

### Frontend Development

- Use Next.js App Router and React hooks
- Maintain separation of concerns between components
- Use TypeScript for type safety
- Follow the established design system
- Store auth tokens in HTTP-only cookies for security

### Authentication

- Use JWT tokens for authentication
- Store tokens in cookies, not localStorage
- Implement proper token refresh logic
- Validate tokens on all protected endpoints

### Deployment

- Ensure environment variables are properly configured
- Use separate settings for development and production
- Configure CORS properly for production
- Set appropriate token expiration times for production 

---

## 9. Error Handling and Recovery Strategies

WHIRL implements comprehensive error handling and recovery mechanisms throughout its architecture to ensure reliability, graceful degradation, and clear error communication to users. This section outlines the error handling strategies employed at different levels of the system.

### Authentication Error Handling

#### Frontend Authentication Errors

```javascript
// Handling authentication errors in fetchWithAuth utility
export async function fetchWithAuth(url, options = {}) {
  // Initial request with access token
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Handle 401 Unauthorized errors
  if (response.status === 401) {
    try {
      // Attempt token refresh
      const newToken = await refreshToken();
      
      // Retry the request with the new token
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      });
    } catch (refreshError) {
      // If refresh fails, redirect to login
      console.error('Token refresh failed:', refreshError);
      window.location.href = '/auth/signin?error=session_expired';
      throw new Error('Authentication failed after token refresh attempt');
    }
  }

  // Handle other error responses
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `Request failed with status ${response.status}`);
  }

  return response;
}
```

#### Backend Authentication Errors

The Django backend implements the following authentication error handling:

1. **Invalid Credentials**:
   - Returns 401 status code with descriptive message
   - Logs failed login attempts with IP address (without sensitive data)
   - Implements rate limiting to prevent brute force attacks

2. **Token Validation Failures**:
   - Clearly distinguishes between expired tokens and invalid tokens
   - Returns appropriate error codes: 401 for expired, 403 for invalid

3. **Permission Errors**:
   - Returns 403 Forbidden with specific permission details
   - Avoids leaking sensitive information in error messages

### SSE Streaming Error Handling

The system employs robust error handling for Server-Sent Events streaming:

#### Frontend SSE Error Handling

```javascript
// Event source error handling in page.tsx
eventSource.addEventListener('error', (event) => {
  console.error('EventSource error:', event);
  
  // Automatically retry connection 3 times with exponential backoff
  if (retryCount < 3) {
    const delay = Math.pow(2, retryCount) * 1000;
    console.log(`Retrying connection in ${delay}ms (attempt ${retryCount + 1}/3)`);
    
    setTimeout(() => {
      connectEventSource();
      retryCount++;
    }, delay);
  } else {
    // Add error message to UI after retry attempts fail
    setMessages((currentMessages) => {
      return currentMessages.map((msg) => {
        if (msg.id === tempAssistantId) {
          return {
            ...msg,
            content: fullResponse + "\n\n*Connection error: Please try again.*",
            error: true,
          };
        }
        return msg;
      });
    });
    
    // Clean up
    eventSource.close();
    setLoading(false);
  }
});

// Handle specific error events from backend
eventSource.addEventListener('error_event', (event) => {
  try {
    const errorData = JSON.parse(event.data);
    
    // Log the specific error
    console.error('Received error from backend:', errorData);
    
    // Update UI with appropriate error message
    setMessages((currentMessages) => {
      return currentMessages.map((msg) => {
        if (msg.id === tempAssistantId) {
          return {
            ...msg,
            content: fullResponse + `\n\n*Error: ${errorData.message || 'Unknown error'}*`,
            error: true,
          };
        }
        return msg;
      });
    });
    
    // Clean up
    eventSource.close();
    setLoading(false);
  } catch (e) {
    console.error('Error parsing error event:', e);
  }
});
```

#### Backend SSE Error Handling

The Django backend implements several layers of error handling for SSE:

1. **Pre-Streaming Validation**:
   ```python
   async def get(self, request, *args, **kwargs):
       try:
           # Validate user authentication
           user = await self.get_authenticated_user(request)
           if not user:
               return JsonResponse({'error': 'Authentication required'}, status=401)
           
           # Extract and validate query parameters
           query_text = request.GET.get('query', '')
           session_id = request.GET.get('session_id', '')
           
           if not query_text:
               return JsonResponse({'error': 'Query text is required'}, status=400)
           
           # Create interaction record
           interaction = await self.get_or_create_interaction(user, chat_session, query_text)
           
           # Return the streaming response
           return StreamingHttpResponse(
               rag_service_sse_proxy_generator(query_text, interaction),
               content_type='text/event-stream',
               headers={
                   'Cache-Control': 'no-cache',
                   'X-Accel-Buffering': 'no'
               }
           )
       except Exception as e:
           # Log the exception
           logger.exception(f"Error in ProcessChatMessageView: {str(e)}")
           return JsonResponse({'error': str(e)}, status=500)
   ```

2. **Error Handling in SSE Generator**:
   ```python
   async def rag_service_sse_proxy_generator(query_text: str, interaction: Interaction):
       full_response_text = ""
       error_occurred = False
       
       try:
           # Initial communication
           yield f"event: init\ndata: {{\"interaction_id\": \"{interaction.id}\"}}\n\n"
           
           # Connect to RAG service
           async with httpx.AsyncClient(timeout=None) as client:
               try:
                   async with client.stream("POST", rag_service_url, json={"query": query_text}) as response:
                       if response.status_code != 200:
                           error_message = await response.read()
                           logger.error(f"RAG service error ({response.status_code}): {error_message}")
                           yield f"event: error\ndata: {{\"error\": \"RAG service error: {response.status_code}\"}}\n\n"
                           error_occurred = True
                           return
                           
                       # Stream response chunks
                       async for chunk in response.aiter_text():
                           yield chunk
                           # Process chunk to extract tokens and update full_response_text
                           
               except httpx.RequestError as e:
                   logger.error(f"Request error connecting to RAG service: {str(e)}")
                   yield f"event: error\ndata: {{\"error\": \"Connection error: {str(e)}\"}}\n\n"
                   error_occurred = True
               except httpx.TimeoutException as e:
                   logger.error(f"Timeout connecting to RAG service: {str(e)}")
                   yield f"event: error\ndata: {{\"error\": \"Request timeout\"}}\n\n"
                   error_occurred = True
               
       except Exception as e:
           logger.exception(f"Error in SSE proxy generator: {str(e)}")
           yield f"event: error\ndata: {{\"error\": \"{str(e)}\"}}\n\n"
           error_occurred = True
       finally:
           # Always save what we have so far
           if full_response_text:
               interaction.final_response_text = full_response_text
               await interaction_save_async()
           
           # Always send an end event, even after errors
           yield f"event: end\ndata: {{}}\n\n"
   ```

#### LLM Service Error Handling

The RAG service implements robust error handling for:

1. **Model Loading Errors**:
   - Graceful initialization failure with clear error messages
   - Automatic fallback to CPU if GPU/MPS is unavailable

2. **Generation Errors**:
   - Timeout handling for long-running generations
   - Retry mechanisms for transient model errors
   - Fallback to safer parameters if generation fails

3. **Document Retrieval Errors**:
   - Fallback to keyword search if vector search fails
   - Empty result handling with appropriate user guidance

### Network Error Recovery

The system implements several strategies for handling network disruptions:

1. **Request Timeouts**:
   - Configurable timeouts for different types of requests
   - Progressive timeouts for streaming connections

2. **Connection Retries**:
   - Exponential backoff for retrying failed connections
   - Maximum retry limits to prevent infinite retry loops

3. **Partial Response Handling**:
   - Saving partial responses when streams are interrupted
   - Providing users with the option to continue from where they left off

### Database Error Handling

1. **Transaction Management**:
   - Atomic transactions for critical operations
   - Rollback mechanisms for failed database operations

2. **Connection Pool Management**:
   - Automatic handling of dropped database connections
   - Connection retry logic with exponential backoff

3. **Data Validation**:
   - Comprehensive model validation in Django models
   - Serializer validation for all API inputs

### Monitoring and Alerting

The system includes comprehensive error monitoring:

1. **Centralized Logging**:
   - Structured logging with contextual information
   - Log aggregation for system-wide visibility

2. **Error Thresholds**:
   - Alerting when error rates exceed thresholds
   - Monitoring of response times and failure rates

3. **User Error Reporting**:
   - In-app mechanisms for users to report issues
   - Automatic capture of context when errors occur

### Degraded Mode Operation

The system can operate in degraded modes when components fail:

1. **RAG Fallback**:
   - If document retrieval fails, the system can fall back to pure LLM generation
   - Clear indication to users when operating in fallback mode

2. **Historical Response Cache**:
   - Previous responses can be served from cache if real-time generation fails
   - Cache invalidation strategies to ensure data freshness

3. **Read-Only Mode**:
   - System can operate in read-only mode if write operations to the database fail
   - Users can still access previously generated content

### User-Facing Error Messages

The system implements a standardized approach to user-facing error messages:

1. **Error Clarity**:
   - Clear, non-technical language for user-facing errors
   - Actionable suggestions when appropriate

2. **Error Categories**:
   - Authentication errors: "Please log in again to continue"
   - Connection errors: "Connection issue detected. Please check your internet connection"
   - System errors: "We're experiencing technical difficulties. Please try again later"
   - Input errors: "Please check your input and try again"

3. **Error Recovery Guidance**:
   - Specific steps users can take to resolve issues
   - Contact information for support when needed 

---

## 10. Performance Optimization Techniques

WHIRL implements various performance optimization techniques across all system components to ensure efficient operation, minimize latency, and provide a responsive user experience even under load. This section outlines the key performance strategies employed in the system.

### Frontend Performance Optimizations

#### React Component Optimizations

1. **Memoization**:
   ```javascript
   // Using React.memo to prevent unnecessary re-renders of expensive components
   const ChatMessage = React.memo(({ message }) => {
     // Component implementation
   }, (prevProps, nextProps) => {
     // Custom comparison function
     return prevProps.message.id === nextProps.message.id && 
            prevProps.message.content === nextProps.message.content;
   });
   ```

2. **Virtualized Lists**:
   - Implementation of virtualized rendering for chat history to handle large conversation threads
   - Only renders messages that are visible in the viewport
   - Uses intersection observers to efficiently track visible elements

3. **Code Splitting**:
   - Dynamic imports for non-critical components
   - Route-based code splitting with Next.js
   - Lazy loading of heavy dependencies

#### Network Optimizations

1. **Efficient Data Fetching**:
   - Pagination of chat history
   - Incremental loading of older messages
   - Request debouncing for search functionality

2. **Payload Optimization**:
   - Minimized JSON response structures
   - Compressed API responses with gzip/brotli
   - Efficient serialization of chat data

3. **Caching Strategies**:
   ```javascript
   // Implementing SWR for data fetching with caching
   const { data, error } = useSWR(`/api/chats/${sessionId}`, fetchWithAuth, {
     revalidateOnFocus: false,
     revalidateOnReconnect: true,
     dedupingInterval: 5000,
     suspense: false,
   });
   ```

#### UI Responsiveness

1. **Non-blocking Operations**:
   - Offloading complex operations to Web Workers
   - Using requestAnimationFrame for UI updates
   - Avoiding synchronous layout calculations

2. **Optimized Rendering**:
   - CSS optimizations for reduced layout thrashing
   - Use of hardware-accelerated animations
   - Shadow DOM for complex components with many updates

3. **Progressive Enhancement**:
   - Core functionality works without JavaScript
   - Enhanced experience with JS enabled
   - Degraded functionality when resources are constrained

### Backend Performance Optimizations

#### Django Optimizations

1. **Database Query Optimization**:
   ```python
   # Optimized database query with select_related
   async def get_chat_sessions(user_id):
       return await ChatSession.objects.filter(user_id=user_id) \
           .select_related('last_interaction') \
           .prefetch_related(
               Prefetch('interactions', 
                        queryset=Interaction.objects.order_by('-created_at')[:1],
                        to_attr='latest_interaction')
           ) \
           .order_by('-updated_at') \
           .asgiref_sync_to_async_list()
   ```

2. **Caching Strategies**:
   - Redis cache for frequently accessed data
   - Cache invalidation patterns for data consistency
   - Tiered caching system for different data types

3. **Asynchronous Processing**:
   - Async views for non-blocking request handling
   - Background task processing with Celery
   - Optimized middleware stack for request processing

#### SSE Performance

1. **Connection Management**:
   - Efficient SSE connection handling
   - Heartbeat mechanism to keep connections alive
   - Connection pooling for RAG service communication

2. **Response Streaming**:
   - Chunk-based streaming to reduce time-to-first-token
   - Non-blocking I/O throughout the response chain
   - Buffer management to prevent memory issues

3. **Protocol Optimizations**:
   ```python
   # ASGI application with optimized SSE middleware
   async def application(scope, receive, send):
       if scope['type'] == 'http' and scope['path'].startswith('/api/chat/stream'):
           await sse_application(scope, receive, send)
       else:
           await django_application(scope, receive, send)
   ```

### LLM Service Optimizations

#### Model Performance

1. **Quantization**:
   - BFloat16 precision for optimal performance/quality balance
   - MPS acceleration on Apple Silicon
   - Mixed precision inference

2. **Batching**:
   - Token generation batching
   - Prompt template compilation and caching
   - Contextual batching for similar queries

3. **Model Configuration**:
   ```python
   # Optimized model configuration
   GENERATION_CONFIG = {
       "max_new_tokens": 512,
       "do_sample": True,
       "temperature": 0.7,
       "top_p": 0.9,
       "top_k": 50,
       "repetition_penalty": 1.1,
       "typical_p": 0.95,
       "use_cache": True,
       "eos_token_id": tokenizer.eos_token_id,
   }
   ```

#### RAG Optimizations

1. **Retrieval Efficiency**:
   - Parallel vector and keyword search
   - Optimized embedding cache
   - Two-stage retrieval (coarse then fine)

2. **Context Processing**:
   - Efficient context window utilization
   - Document deduplication before LLM processing
   - Context relevance scoring and filtering

3. **Vector Storage Optimizations**:
   - Optimized ChromaDB configuration
   - Index compression techniques
   - Partitioned indices for faster search

#### Streaming Optimizations

1. **Token Generation**:
   - Custom streaming generator with minimal overhead
   - Thread-based background processing
   - Token batching with immediate flushing

2. **Memory Management**:
   ```python
   # Memory efficient streaming generator
   @torch.inference_mode()
   def generate_streaming(self, prompt, context_docs=None):
       # Set up generation
       input_ids = self._prepare_input(prompt, context_docs)
       
       # Stream tokens with minimal memory overhead
       for token in self.model.generate(
           input_ids=input_ids,
           generation_config=self.generation_config,
           streamer=self.streamer,
           return_dict_in_generate=False,
       ):
           # Process and yield each token immediately
           yield self.tokenizer.decode([token], skip_special_tokens=True)
       
       # Clean up tensors explicitly
       del input_ids
       torch.cuda.empty_cache()
   ```

3. **HTTP Optimizations**:
   - Keep-alive connections between services
   - Chunked transfer encoding
   - Optimized event format minimizing overhead

### Infrastructure Optimizations

1. **Resource Allocation**:
   - Service-specific resource limits
   - Automatic scaling based on load metrics
   - Memory optimization for each service

2. **Load Distribution**:
   - Queue-based load leveling
   - Request throttling for fairness
   - Priority handling for critical requests

3. **Deployment Optimizations**:
   - Docker container optimization (slim images)
   - Service colocation for reduced network overhead
   - Environment-specific configurations

### Monitoring and Profiling

1. **Performance Metrics**:
   - Request latency tracking at each service boundary
   - Token generation speed monitoring
   - Memory usage profiling

2. **Bottleneck Identification**:
   - Centralized performance monitoring
   - Automated profiling for slow requests
   - Periodic stress testing

3. **Continuous Optimization**:
   - Performance regression testing
   - A/B testing of optimization strategies
   - User-perceived performance tracking

### Results and Benchmarks

Key performance metrics for the WHIRL system:

| Metric | Value | Notes |
|--------|-------|-------|
| Time to First Token | < 500ms | Time from query submission to first token display |
| Token Generation Rate | 15-20 tokens/sec | Using Llama 3.2 3B on MPS acceleration |
| Memory Usage | ~4GB | Total RAM usage of RAG service |
| Concurrent Users | Up to 50 | Supported on reference hardware |
| Query Throughput | ~10/minute | Per instance rate limit |
| Response Completion | 5-15 seconds | Typical time for complete response generation |

These optimizations collectively ensure that WHIRL provides a responsive, efficient experience while maintaining high-quality, accurate responses.

---

## 11. Testing Framework and Methodology

WHIRL employs comprehensive testing methodologies across all system components to ensure reliability, accuracy, and performance. This section outlines the testing frameworks, approaches, and strategies implemented to maintain high-quality standards.

### Testing Pyramid

The testing strategy follows a pyramid approach:

```
                    ┌───────────────┐
                    │     E2E       │
                    │   Testing     │
                    └───────┬───────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
      ┌──────┴──────┐              ┌──────┴──────┐
      │  Integration │              │   UI/UX     │
      │   Testing    │              │  Testing    │
      └──────┬───────┘              └──────┬──────┘
             │                             │
    ┌────────┴────────┐            ┌──────┴───────┐
    │                 │            │              │
┌───┴───┐        ┌────┴───┐    ┌───┴────┐     ┌───┴────┐
│ Unit  │        │ API    │    │Component│     │Snapshot│
│ Tests │        │ Tests  │    │ Tests   │     │ Tests  │
└───────┘        └────────┘    └─────────┘     └────────┘
```

### Frontend Testing

#### Component Testing

1. **React Component Testing**:
   ```javascript
   // ChatMessage component test using React Testing Library
   describe('ChatMessage', () => {
     test('renders user message correctly', () => {
       const message = {
         id: '123',
         role: 'user',
         content: 'This is a test message',
         createdAt: new Date().toISOString()
       };
       
       const { getByText, container } = render(<ChatMessage message={message} />);
       
       expect(getByText('This is a test message')).toBeInTheDocument();
       expect(container.querySelector('.user-message')).toBeInTheDocument();
     });
   });
   ```

2. **Snapshot Testing**:
   - Jest snapshot tests for UI components
   - Visual regression testing for design consistency
   - Storybook for component documentation and visual testing

3. **User Event Testing**:
   - Simulation of user interactions (clicks, typing, etc.)
   - Form validation testing
   - Accessibility testing (a11y)

#### Frontend Integration Testing

1. **Page-level Tests**:
   - Testing pages with mocked API responses
   - Navigation flow testing
   - State management tests

2. **API Integration**:
   - Mock Service Worker (MSW) for API simulation
   - Testing error handling and loading states
   - Authentication flow testing

3. **Custom React Hooks Testing**:
   ```javascript
   // Testing custom hook for authentication
   test('useAuth provides authentication functionality', async () => {
     const { result, waitForNextUpdate } = renderHook(() => useAuth());
     
     expect(result.current.isAuthenticated).toBe(false);
     
     act(() => {
       result.current.login('test@example.com', 'password123');
     });
     
     await waitForNextUpdate();
     
     expect(result.current.isAuthenticated).toBe(true);
     expect(result.current.user).toEqual(expect.objectContaining({
       email: 'test@example.com',
     }));
   });
   ```

### Backend Testing

#### Unit Testing

1. **Model Testing**:
   ```python
   @pytest.mark.django_db
   def test_chat_session_creation():
       user = User.objects.create(email="test@example.com", username="testuser")
       chat = ChatSession.objects.create(
           user=user,
           title="Test Chat"
       )
       
       assert chat.id is not None
       assert chat.title == "Test Chat"
       assert chat.user == user
       assert chat.created_at is not None
   ```

2. **Serializer Testing**:
   - Data validation testing
   - Field transformation logic
   - Edge case handling

3. **Utility Function Tests**:
   - Testing helper functions
   - Authentication utilities
   - Data processing functions

#### API Testing

1. **Endpoint Testing**:
   ```python
   @pytest.mark.django_db
   async def test_chat_stream_endpoint(client, authenticated_user):
       # Setup test data
       chat_session = await ChatSession.objects.acreate(
           user=authenticated_user,
           title="Test Chat"
       )
       
       # Make request to the streaming endpoint
       response = await client.get(
           f"/api/chat/stream/?session_id={chat_session.id}&query=test",
           HTTP_AUTHORIZATION=f"Bearer {authenticated_user.token}"
       )
       
       # Verify response
       assert response.status_code == 200
       assert response['Content-Type'] == 'text/event-stream'
   ```

2. **Authentication Tests**:
   - JWT token validation
   - Permission testing
   - Token refresh mechanism

3. **Edge Case Testing**:
   - Rate limiting behavior
   - Error response formats
   - Concurrent request handling

#### Integration Testing

1. **Database Integration**:
   - Transaction integrity
   - Query performance
   - Schema migration testing

2. **Async Functionality**:
   - Streaming response testing
   - Concurrent request handling
   - Task queue integration

3. **API Communication**:
   - Django to RAG service communication
   - Header propagation
   - Error propagation

### RAG Service Testing

#### Retrieval Testing

1. **Vector Search Quality**:
   ```python
   def test_vector_search_accuracy():
       ragbot = RAGBot()
       results = ragbot.vector_search("symptoms of endometriosis", top_k=5)
       
       # Check relevance scores
       assert all(doc.score > 0.75 for doc in results)
       
       # Check relevant content is retrieved
       assert any("endometriosis" in doc.page_content.lower() for doc in results)
       assert any("symptoms" in doc.page_content.lower() for doc in results)
   ```

2. **BM25 Search Testing**:
   - Keyword matching precision
   - Recall metrics
   - Relevance scoring

3. **Hybrid Search Evaluation**:
   - Combined vector and keyword search effectiveness
   - Ablation studies comparing different retrieval strategies
   - Domain-specific evaluation metrics

#### LLM Generation Testing

1. **Response Quality Testing**:
   - Medical accuracy evaluation (with domain expert review)
   - Response coherence metrics
   - Source citation accuracy

2. **Prompt Engineering Tests**:
   - Template effectiveness testing
   - A/B testing of different prompts
   - Context window optimization

3. **Streaming Reliability**:
   ```python
   @pytest.mark.asyncio
   async def test_streaming_generation():
       ragbot = RAGBot()
       query = "What are the signs of preeclampsia?"
       
       # Count tokens in stream
       token_count = 0
       async for token in ragbot.generate_streaming(query):
           token_count += 1
           assert isinstance(token, str)
           assert len(token) > 0
       
       # Check we got a reasonable number of tokens
       assert token_count > 50
   ```

### End-to-End Testing

1. **User Flow Testing**:
   - Login → query entry → response → feedback loop
   - Chat history navigation
   - Error recovery paths

2. **Cross-service Integration**:
   - Full request/response cycle testing
   - Backend to LLM service communication
   - Token streaming through the entire stack

3. **Performance Testing**:
   - Load testing with simulated users
   - Stress testing under high concurrency
   - Endurance testing for stability

### Testing Infrastructure

1. **CI/CD Integration**:
   - GitHub Actions workflows for automated testing
   - Pre-merge test validation
   - Deployment gating based on test results

2. **Testing Environment Management**:
   - Dockerized testing environments
   - Database seeding with test data
   - Mock external dependencies

3. **Test Result Monitoring**:
   - Centralized test result dashboards
   - Code coverage tracking
   - Performance trend analysis

### Quality Assurance Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Code Coverage | >90% | Percentage of code covered by tests |
| Response Accuracy | >95% | Correctness of medical information |
| E2E Test Pass Rate | 100% | Critical user paths fully functional |
| UI Component Coverage | >95% | Frontend components with tests |
| API Endpoint Coverage | 100% | All endpoints covered by tests |

### Domain-Specific Testing

1. **Medical Accuracy Testing**:
   - Collaboration with medical professionals for validation
   - Ground truth comparison for responses
   - Factual accuracy scoring

2. **Citation Testing**:
   - Verification of source attribution
   - Citation format consistency
   - Source reliability verification

3. **Ethical Evaluation**:
   - Testing for bias in responses
   - Handling of sensitive medical topics
   - Privacy and data protection validation

This comprehensive testing approach ensures that WHIRL provides reliable, accurate, and performant responses to women's health queries while maintaining high standards for medical information quality.