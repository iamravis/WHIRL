import { PrismaClient } from '@prisma/client';
import { generateEmbedding, cosineSimilarity } from './embeddingGeneration';
import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

// **** ChromaDB Imports ****
import { getChromaClient, COLLECTION_NAME } from '../chromaClient'; // Corrected path: up one level from rag

// Initialize Prisma client (still needed for metadata potentially, or can be removed if Chroma metadata is sufficient)
const prisma = new PrismaClient();

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure retrieval logger
const retrievalLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { component: 'vector-search' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'retrieval-error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'retrieval.log') 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Interface for search results
export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  similarity: number;
  metadata: {
    filename: string;
    title?: string;
    synopsis?: string;
    year?: string;
    authors?: string;
    publisher?: string;
    additionalMetadata?: string;
    chunkIndex?: number;
    distance?: number;
  };
}

/**
 * Search for document chunks similar to the query using ChromaDB
 */
export async function semanticSearch(
  query: string,
  maxResults: number = 4,
  distanceThreshold: number = 0.7 // Example threshold for L2 distance (lower is better)
): Promise<SearchResult[]> {
  const startTime = Date.now();
  retrievalLogger.info('Starting semantic search with ChromaDB', { query, maxResults, distanceThreshold });

  try {
    // 1. Generate embedding for the query
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(query);
      retrievalLogger.info('Query embedding generated successfully', { queryLength: query.length, embeddingDim: queryEmbedding.length });
    } catch (embeddingError) {
      retrievalLogger.error('Failed to generate query embedding', {
        error: (embeddingError as Error).message,
        query: query.substring(0, 100) + '...',
        stack: (embeddingError as Error).stack
      });
      throw embeddingError; // Re-throw to indicate failure
    }

    // 2. Connect to ChromaDB and get collection
    const chromaClient = getChromaClient();
    const collection = await chromaClient.getCollection({ name: COLLECTION_NAME });
    retrievalLogger.info(`Connected to ChromaDB collection: ${COLLECTION_NAME}`);

    // 3. Query ChromaDB
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: maxResults * 2, // Retrieve more initially to allow for filtering
      include: ['metadatas', 'documents', 'distances']
    });
    retrievalLogger.info('ChromaDB query completed', { 
        numResultsRaw: results.ids?.[0]?.length ?? 0,
        duration: Date.now() - startTime 
    });

    // 4. Process and filter results
    if (!results || !results.ids || results.ids.length === 0 || !results.ids[0]) {
      retrievalLogger.warn('ChromaDB returned no results or unexpected format', { query });
      return [];
    }

    const processedResults: SearchResult[] = [];
    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances[0][i];
      if (distance > distanceThreshold) {
        continue; // Skip results with distance above the threshold
      }

      const chromaMetadata = results.metadatas[0][i] as any; // Type assertion needed
      const content = results.documents[0][i];
      const prismaChunkId = chromaMetadata?.prismaChunkId || results.ids[0][i]; // Fallback to Chroma ID

      // Calculate similarity (optional, common is 1 - distance for L2)
      // Note: ChromaDB distances might be L2 (Euclidean) or Cosine depending on collection setup.
      // Assuming L2, a simple similarity approximation can be 1 - distance, but interpret with caution.
      const similarity = 1 - distance; 

      processedResults.push({
        chunkId: prismaChunkId,
        documentId: chromaMetadata?.documentId || 'unknown',
        content: content || '',
        similarity: similarity, 
        metadata: {
          filename: chromaMetadata?.documentFilename || 'unknown',
          chunkIndex: chromaMetadata?.chunkIndex, // Include chunk index if available
          distance: distance, // Include raw distance
          // Note: Other metadata fields (title, author etc.) are NOT included here
          // as they were likely not stored directly in ChromaDB metadata in the rebuild script.
          // If needed, a separate Prisma query using documentId could fetch them.
        },
      });
    }

    // Sort by similarity (descending) which is equivalent to distance (ascending)
    processedResults.sort((a, b) => b.similarity - a.similarity);

    const finalResults = processedResults.slice(0, maxResults);

    // Log performance and final results
    const endTime = Date.now();
    const duration = endTime - startTime;
    retrievalLogger.info('Semantic search with ChromaDB completed', {
      duration,
      numResults: finalResults.length,
      topScore: finalResults.length > 0 ? finalResults[0].similarity : null,
      topDistance: finalResults.length > 0 ? finalResults[0].metadata.distance : null,
    });

    return finalResults;

  } catch (error) {
    retrievalLogger.error('Error during semantic search with ChromaDB', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      duration: Date.now() - startTime
    });
    return []; // Return empty array on error
  }
}

/**
 * Get the appropriate context for a query
 */
export async function getQueryContext(query: string): Promise<string> {
  try {
    // Search for relevant documents
    const searchResults = await semanticSearch(query);
    
    if (searchResults.length === 0) {
      return ""; // No relevant context found
    }
    
    // Format the context with document metadata
    const formattedContext = searchResults.map(result => {
      const { content, metadata } = result;
      const { title, authors, year, publisher } = metadata;
      
      // Add metadata to the context
      let metadataText = '';
      if (title) metadataText += `Title: ${title}\n`;
      if (authors) metadataText += `Authors: ${authors}\n`;
      if (year) metadataText += `Year: ${year}\n`;
      if (publisher) metadataText += `Publisher: ${publisher}\n`;
      
      // Return the formatted context
      return `---\n${metadataText}Content:\n${content}\n---`;
    }).join('\n\n');
    
    return formattedContext;
  } catch (error) {
    console.error('Error getting query context:', error);
    return ""; // Return empty context on error
  }
}

/**
 * Determine if the query is a general conversation or a medical/domain-specific query
 */
export function isGeneralConversation(query: string): boolean {
  // List of common greetings and general conversation starters
  const generalPhrases = [
    'hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening',
    'how are you', 'how\'s it going', 'what\'s up', 'nice to meet', 'pleased to meet',
    'thanks', 'thank you', 'goodbye', 'bye', 'see you', 'talk to you later',
    'who are you', 'what can you do', 'help me', 'can you help', 'tell me about yourself'
  ];
  
  // Convert query to lowercase for case-insensitive matching
  const lowercaseQuery = query.toLowerCase();
  
  // Check if the query contains any general phrases
  return generalPhrases.some(phrase => lowercaseQuery.includes(phrase));
} 