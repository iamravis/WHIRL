import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

// Initialize Prisma client
const prisma = new PrismaClient();

// Cache for the embedding model
let embeddingModel: any = null;

// Constants for embedding model
const MODEL_NAME = 'Xenova/paraphrase-mpnet-base-v2'; // Changed to mpnet model 
const MODEL_DIMENSIONS = 768; // mpnet-base-v2 has 768 dimensions

/**
 * Load the embedding model
 */
async function loadEmbeddingModel() {
  if (!embeddingModel) {
    console.log(`Loading embedding model ${MODEL_NAME}...`);
    try {
      // --- Dynamically import pipeline --- 
      const { pipeline } = await import('@xenova/transformers');
      // --- End Dynamic Import ---

      // Using mpnet-base-v2 as specified in the PRD
      embeddingModel = await pipeline('feature-extraction', MODEL_NAME);
      console.log(`Embedding model ${MODEL_NAME} loaded successfully (${MODEL_DIMENSIONS} dimensions)`);
    } catch (error) {
      console.error('Error loading embedding model:', error);
      throw error;
    }
  }
  return embeddingModel;
}

/**
 * Generate embeddings using the local model
 */
async function generateEmbeddingLocal(text: string): Promise<number[]> {
  try {
    const model = await loadEmbeddingModel();
    let output;
    try {
      console.log(`Attempting local inference for text: "${text.substring(0, 50)}..."`);
      
      // Try forcing array output again, checking Array.isArray
      output = await model(text, {
        pooling: 'mean',
        normalize: true,
        return_tensors: false // Explicitly request non-tensor output
      });
      
      console.log("Local inference successful.");
      
      // Check if the output is a standard array as expected
      if (output && Array.isArray(output)) {
        const embedArray = output.map(val => Number(val));
        
        // Verify dimensions
        if (embedArray.length !== MODEL_DIMENSIONS) {
          console.warn(`Dimension mismatch: got ${embedArray.length}, expected ${MODEL_DIMENSIONS}`);
          if (embedArray.length > MODEL_DIMENSIONS) {
            return embedArray.slice(0, MODEL_DIMENSIONS);
          } else if (embedArray.length < MODEL_DIMENSIONS) {
            const padding = new Array(MODEL_DIMENSIONS - embedArray.length).fill(0);
            return [...embedArray, ...padding];
          }
        }
        
        return embedArray;
      // Fallback check for the previous tensor structure if the above fails
      } else if (output && output.cpuData) { 
        console.warn("Local inference returned tensor despite return_tensors=false. Using cpuData.");
        const embedArray = Array.from(output.cpuData).map(val => Number(val));
        // (Dimension verification logic duplicated for safety - can be refactored later)
        if (embedArray.length !== MODEL_DIMENSIONS) {
          console.warn(`Dimension mismatch: got ${embedArray.length}, expected ${MODEL_DIMENSIONS}`);
          if (embedArray.length > MODEL_DIMENSIONS) {
            return embedArray.slice(0, MODEL_DIMENSIONS);
          } else if (embedArray.length < MODEL_DIMENSIONS) {
            const padding = new Array(MODEL_DIMENSIONS - embedArray.length).fill(0);
            return [...embedArray, ...padding];
          }
        }
        return embedArray;
      }
      else {
        console.error("Invalid model output format:", output);
        throw new Error('Invalid model output format: Expected Array or Tensor with cpuData');
      }
    } catch (e) {
      console.error("Error during model inference:", e);
      // Log the input text that caused the error
      if (typeof text === 'string') {
          console.error("Input text that caused error:", text.substring(0, 200) + (text.length > 200 ? "..." : ""));
      } else {
          console.error("Invalid input type provided:", typeof text);
      }
      // Rethrow the error to trigger fallback
      throw e;
    }
  } catch (error) {
    console.error("Failed to generate local embedding:", error);
    throw error; // Rethrow to ensure fallback mechanism is triggered
  }
}

/**
 * Generate embeddings using a remote API (fallback)
 */
async function generateEmbeddingAPI(text: string): Promise<number[]> {
  try {
    console.log("Attempting to use Hugging Face API for embedding generation with simplified input");
    
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      throw new Error('HF_TOKEN environment variable not set');
    }
    
    const modelEndpoint = 'https://api-inference.huggingface.co/models/sentence-transformers/paraphrase-mpnet-base-v2';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      // Reverting to the simplest input format based on general HF API docs
      const requestBody = {
        inputs: text 
      };

      console.log("Sending API request with body:", JSON.stringify(requestBody));

      const response = await fetch(modelEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hfToken}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Clear timeout if request completes
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details available');
        console.error(`API request failed with status ${response.status}. Response body: ${errorText}`);
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      console.log("Received API response:", JSON.stringify(result).substring(0, 200) + "..."); // Log truncated response
      
      let embedding: number[] = [];
      
      // Handle potential response structures (assuming result is likely [[emb1]] or similar)
      if (result && Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
         // Common format: [[emb1], [emb2], ...] - we sent one sentence, expect one embedding
         embedding = result[0] as number[];
      } else if (result && result.embeddings && Array.isArray(result.embeddings) && result.embeddings.length > 0 && Array.isArray(result.embeddings[0])) {
         // Alternative format: { embeddings: [[emb1], [emb2], ...] }
         embedding = result.embeddings[0] as number[];
      } else if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'number') {
          // Direct array for a single embedding (less common for sentence transformers)
          embedding = result as number[];
      }
       else {
        console.error("Unexpected API response format:", JSON.stringify(result));
        throw new Error('Unrecognized or empty API response format');
      }
      
      // Verify dimensions
      if (embedding.length !== MODEL_DIMENSIONS) {
        console.warn(`API embedding dimension mismatch: got ${embedding.length}, expected ${MODEL_DIMENSIONS}. Padding/truncating.`);
        if (embedding.length > MODEL_DIMENSIONS) {
          return embedding.slice(0, MODEL_DIMENSIONS);
        } else {
          const padding = new Array(MODEL_DIMENSIONS - embedding.length).fill(0);
          return [...embedding, ...padding];
        }
      }
      
      return embedding;
    } finally {
      clearTimeout(timeoutId); // Ensure timeout is always cleared
    }
  } catch (error) {
    console.error('Error using API for embeddings:', error);
    // Ensure the error is rethrown so the calling function knows it failed
    throw error; 
  }
}

/**
 * Calculate the cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions don't match: ${vecA.length} vs ${vecB.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate embedding for a text, with fallback options
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return await generateEmbeddingLocal(text);
  } catch (error) {
    console.warn('Failed to generate embedding locally, falling back to API:', error);
    return await generateEmbeddingAPI(text);
  }
}

/**
 * Process chunks that don't have embeddings yet
 */
export async function processUnembeddedChunks(batchSize: number = 10): Promise<number> {
  // Get chunks without embeddings
  const chunks = await prisma.documentChunk.findMany({
    where: {
      DocumentEmbedding: null
    },
    take: batchSize,
  });

  if (chunks.length === 0) {
    return 0;
  }

  console.log(`Processing ${chunks.length} chunks without embeddings`);

  // Process each chunk
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk.content);
      
      // Store the embedding
      await prisma.documentEmbedding.create({
        data: {
          id: chunk.id,
          chunkId: chunk.id,
          embedding: embedding,
          model: MODEL_NAME,
          updatedAt: new Date()
        },
      });
      
      console.log(`Generated embedding for chunk ${chunk.id}`);
    } catch (error) {
      console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
    }
  }

  return chunks.length;
}

/**
 * Generate embeddings for all chunks in the database
 */
export async function generateAllEmbeddings(): Promise<void> {
  let processed = 0;
  let batchResult = 0;
  
  do {
    batchResult = await processUnembeddedChunks();
    processed += batchResult;
    console.log(`Processed ${processed} chunks so far`);
  } while (batchResult > 0);
  
  console.log(`Completed embedding generation for ${processed} chunks`);
}

/**
 * Regenerate embeddings for all documents (even those with existing embeddings)
 */
export async function regenerateAllEmbeddings(): Promise<void> {
  // Delete all existing embeddings
  await prisma.documentEmbedding.deleteMany({});
  console.log('Deleted all existing embeddings');
  
  // Generate new embeddings
  await generateAllEmbeddings();
  console.log('Regenerated all embeddings');
} 