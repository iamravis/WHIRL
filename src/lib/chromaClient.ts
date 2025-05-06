import { ChromaClient } from 'chromadb';
import path from 'path';

// Revert to initializing with path
const defaultPath = path.resolve('./chroma_data');
const chromaPath = process.env.CHROMA_DB_PATH || defaultPath;
console.log(`Initializing ChromaDB client for persistence at path: ${chromaPath}`);

let client: ChromaClient;
try {
  client = new ChromaClient({ path: chromaPath });
  console.log("ChromaDB client initialized successfully with path.");
} catch (error) {
  console.error("Failed to initialize ChromaDB client:", error);
  throw new Error("Could not initialize ChromaDB client.");
}

/**
 * Returns the initialized ChromaDB client instance.
 */
export function getChromaClient(): ChromaClient {
  if (!client) {
    throw new Error("ChromaDB client is not initialized.");
  }
  return client;
}

// Define the collection name to be used consistently
export const COLLECTION_NAME = 'medical_documents'; 