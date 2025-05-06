import path from 'path';
import { processMarkdownDirectory } from '../lib/rag/documentProcessing';
import { generateAllEmbeddings } from '../lib/rag/embeddingGeneration';

// Path constants
const DATA_DIR = path.resolve(process.cwd(), 'data');
const MARKDOWN_DIR = path.join(DATA_DIR, 'cleaned_markdown');
const METADATA_PATH = path.join(DATA_DIR, 'document_metadata.csv');

/**
 * Main function to ingest documents and generate embeddings
 */
async function main() {
  console.log('Starting document ingestion process...');
  
  try {
    // Process all markdown files
    console.log('Processing markdown documents...');
    await processMarkdownDirectory(MARKDOWN_DIR, METADATA_PATH);
    
    // Generate embeddings for all chunks
    console.log('Generating embeddings for document chunks...');
    await generateAllEmbeddings();
    
    console.log('✅ Document ingestion complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during document ingestion:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 