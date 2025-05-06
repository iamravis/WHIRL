import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import csv from 'csv-parser';
import winston from 'winston';
import 'winston-daily-rotate-file';

// Initialize Prisma client
const prisma = new PrismaClient();

// Configure document processing logger
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const processingLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { component: 'document-processing' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'processing-error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'processing.log') 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Interface for document metadata
interface DocumentMetadata {
  filename: string;
  title?: string;
  synopsis?: string;
  year?: string;
  authors?: string;
  publisher?: string;
  additional_metadata?: string;
}

/**
 * List of medical concepts that should be kept together when possible
 */
const medicalConcepts = [
  "diabetes mellitus", "type 1 diabetes", "type 2 diabetes", "gestational diabetes",
  "insulin resistance", "hyperglycemia", "hypoglycemia", "glucose tolerance",
  "diabetic ketoacidosis", "diabetic retinopathy", "diabetic nephropathy", "diabetic neuropathy",
  "preeclampsia", "eclampsia", "hypertensive disorders", "gestational hypertension",
  "placenta previa", "placental abruption", "placenta accreta", "vasa previa", 
  "obstetric hemorrhage", "postpartum hemorrhage", "uterine rupture", "uterine atony",
  "cesarean section", "vaginal birth", "instrumental delivery", "shoulder dystocia",
  "preterm labor", "preterm birth", "premature rupture of membranes", "cervical insufficiency",
  "intrauterine growth restriction", "small for gestational age", "large for gestational age",
  "fetal distress", "fetal heart rate", "fetal movement", "fetal presentation",
  "gynecological cancer", "cervical cancer", "endometrial cancer", "ovarian cancer",
  "polycystic ovary syndrome", "endometriosis", "adenomyosis", "uterine fibroids",
  "fertility treatment", "assisted reproduction", "in vitro fertilization", "embryo transfer",
  "ovulation induction", "luteal phase", "oocyte retrieval", "intracytoplasmic sperm injection"
];

/**
 * Boundaries that should trigger chunk separation
 */
const chunkBoundaryMarkers = [
  "# ", "## ", "### ", "#### ", "##### ", "###### ", // Markdown headings
  "\n---\n", "\n___\n", "\n***\n", // Markdown horizontal rules
  "\nIntroduction:", "\nConclusion:", "\nDiscussion:", "\nMethods:", "\nResults:", // Common section headers
  "\nREFERENCES", "\nBIBLIOGRAPHY", "\nAPPENDIX" // Reference sections
];

/**
 * Detect if a paragraph contains a medical concept that should be kept intact
 */
function containsMedicalConcept(paragraph: string): boolean {
  const lowercaseParagraph = paragraph.toLowerCase();
  return medicalConcepts.some(concept => lowercaseParagraph.includes(concept));
}

/**
 * Check if text contains a boundary marker
 */
function containsBoundaryMarker(text: string): boolean {
  return chunkBoundaryMarkers.some(marker => text.includes(marker));
}

/**
 * Generate a title for a chunk based on its content
 */
function generateChunkTitle(chunkContent: string, documentTitle: string): string {
  // Look for a heading pattern in the content
  const headingMatch = chunkContent.match(/^#+\s+(.+)$/m) || 
                       chunkContent.match(/^(.+)\n[=\-]{2,}$/m);
  
  if (headingMatch && headingMatch[1]) {
    return `${documentTitle} - ${headingMatch[1].trim()}`;
  }
  
  // If no heading found, return a generic title with document title
  return documentTitle;
}

/**
 * Enhanced semantic chunking with awareness of medical concepts and document structure
 * Uses 250 token size with 25 token overlap as specified in the PRD
 */
export function enhancedSemanticChunkText(text: string, documentTitle: string = "", targetTokens: number = 250, overlapTokens: number = 25): string[] {
  processingLogger.info('Creating enhanced semantic chunks', { 
    textLength: text.length,
    targetTokens,
    overlapTokens 
  });

  // Approximate tokens to characters (assuming 4.5 chars per token on average for English text)
  const charsPerToken = 4.5;
  const targetChars = Math.round(targetTokens * charsPerToken);
  const overlapChars = Math.round(overlapTokens * charsPerToken);
  const maxChars = targetChars * 1.5; // Allow some flexibility
  const minChars = targetChars * 0.7; // Minimum size for a chunk
  
  // Split the text into paragraphs
  const paragraphs = text.split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  processingLogger.info('Split document into paragraphs', { 
    paragraphCount: paragraphs.length 
  });
  
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentChunkSize = 0;
  
  // Process each paragraph
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphSize = paragraph.length;
    
    // Check if adding this paragraph would exceed max chunk size
    const wouldExceedMax = currentChunkSize + paragraphSize > maxChars;
    
    // Check if this paragraph contains a boundary marker
    const isBoundary = containsBoundaryMarker(paragraph);
    
    // Check if current chunk is at least minimum size and we have a boundary or would exceed max
    const shouldEndChunk = 
      (currentChunkSize >= minChars && (isBoundary || wouldExceedMax)) || 
      (currentChunkSize + paragraphSize > maxChars);
    
    // Save current chunk if we should end it and have content
    if (shouldEndChunk && currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n\n');
      chunks.push(chunkContent);
      
      // Start a new chunk with the boundary paragraph if it exists
      currentChunk = isBoundary ? [paragraph] : [];
      currentChunkSize = isBoundary ? paragraphSize : 0;
      
      // If we have content and need overlap, add the last sentence or two
      if (!isBoundary && chunkContent.length > overlapChars) {
        // Find the last few sentences for overlap
        const lastPortion = chunkContent.slice(-overlapChars * 2);
        const sentenceMatch = lastPortion.match(/[^.!?]*[.!?](?:\s|$)/g);
        
        if (sentenceMatch && sentenceMatch.length > 0) {
          // Use the last 1-2 sentences as overlap
          const overlapText = sentenceMatch.slice(-2).join('').trim();
          if (overlapText) {
            currentChunk = [overlapText];
            currentChunkSize = overlapText.length;
          }
        }
      }
    } else {
      // Add to current chunk
      currentChunk.push(paragraph);
      currentChunkSize += paragraphSize;
    }
    
    // Special case: if this paragraph contains a medical concept and the next paragraph
    // continues the discussion, keep them together if possible
    if (containsMedicalConcept(paragraph) && i < paragraphs.length - 1) {
      const nextParagraph = paragraphs[i + 1];
      // If the next paragraph is small enough, add it to current chunk regardless
      if (currentChunkSize + nextParagraph.length <= maxChars) {
        currentChunk.push(nextParagraph);
        currentChunkSize += nextParagraph.length;
        i++; // Skip the next paragraph in the loop
        processingLogger.info('Kept medical concept intact by combining paragraphs');
      }
    }
  }
  
  // Add the final chunk if there's content left
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n\n');
    chunks.push(chunkContent);
  }
  
  // Log chunk statistics
  const avgChunkLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length;
  const approxTokens = Math.round(avgChunkLength / charsPerToken);
  
  processingLogger.info('Created enhanced semantic chunks', {
    inputLength: text.length,
    chunkCount: chunks.length,
    averageChunkLength: avgChunkLength,
    approximateTokensPerChunk: approxTokens
  });
  
  return chunks;
}

/**
 * Load metadata from the CSV file
 */
export async function loadDocumentMetadata(metadataPath: string): Promise<Map<string, DocumentMetadata>> {
  return new Promise((resolve, reject) => {
    const metadataMap = new Map<string, DocumentMetadata>();
    
    fs.createReadStream(metadataPath)
      .pipe(csv())
      .on('data', (data: any) => {
        metadataMap.set(data.filename, {
          filename: data.filename,
          title: data.title,
          synopsis: data.synopsis,
          year: data.year,
          authors: data.authors,
          publisher: data.publisher,
          additional_metadata: data.additional_metadata
        });
      })
      .on('end', () => {
        resolve(metadataMap);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Process a markdown file with enhanced semantic chunking and store it in the database
 * Follows PRD specifications with 250 token size and 25 token overlap
 */
export async function processMarkdownFileEnhanced(
  filePath: string, 
  metadataMap: Map<string, DocumentMetadata>
): Promise<void> {
  const startTime = Date.now();
  const filename = path.basename(filePath);
  
  processingLogger.info('Starting enhanced document processing', { filename, filePath });
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Get metadata for this file
    const metadata = metadataMap.get(filename) || { filename: filename };
    const documentTitle = metadata.title || filename;
    
    // Create or update document in the database
    const document = await prisma.document.upsert({
      where: { filename: filename },
      update: {
        title: metadata.title || null,
        synopsis: metadata.synopsis || null,
        year: metadata.year || null,
        authors: metadata.authors || null,
        publisher: metadata.publisher || null,
        additionalMetadata: metadata.additional_metadata || null,
      },
      create: {
        filename: filename,
        title: metadata.title || null,
        synopsis: metadata.synopsis || null,
        year: metadata.year || null,
        authors: metadata.authors || null,
        publisher: metadata.publisher || null,
        additionalMetadata: metadata.additional_metadata || null,
      },
    });
    
    // Delete existing chunks (if any)
    processingLogger.info('Deleting existing chunks for document', { documentId: document.id });
    await prisma.documentChunk.deleteMany({
      where: { documentId: document.id },
    });
    
    // Create enhanced semantic chunks following PRD specifications (250 tokens, 25 token overlap)
    const chunks = enhancedSemanticChunkText(fileContent, documentTitle);
    
    processingLogger.info('Created enhanced semantic chunks', { 
      documentId: document.id,
      chunkCount: chunks.length
    });
    
    // Store chunks and save to semantic-chunks directory
    const chunksDir = path.join(process.cwd(), 'data', 'semantic-chunks');
    if (!fs.existsSync(chunksDir)) {
      fs.mkdirSync(chunksDir, { recursive: true });
    }
    
    // Save chunks to the database
    for (let i = 0; i < chunks.length; i++) {
      const chunkTitle = generateChunkTitle(chunks[i], documentTitle);
      
      await prisma.documentChunk.create({
        data: {
          documentId: document.id,
          content: chunks[i],
          chunkIndex: i,
          chunkTitle: chunkTitle
        },
      });
    }
    
    // Save chunks to file system for easy inspection
    const documentChunksFile = path.join(chunksDir, `${filename.replace('.md', '')}-chunks.json`);
    fs.writeFileSync(documentChunksFile, JSON.stringify({
      title: documentTitle,
      filename: filename,
      chunks: chunks.map((content, index) => ({
        index,
        content,
        title: generateChunkTitle(content, documentTitle)
      }))
    }, null, 2));
    
    processingLogger.info('Document processed successfully', { 
      documentId: document.id, 
      filename,
      chunkCount: chunks.length,
      processingTime: Date.now() - startTime
    });
  } catch (error) {
    processingLogger.error('Error processing document', {
      filename,
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    throw error;
  }
}

/**
 * Process all markdown files in a directory using enhanced semantic chunking
 */
export async function processMarkdownDirectoryEnhanced(
  directoryPath: string,
  metadataPath: string
): Promise<void> {
  processingLogger.info('Starting enhanced document processing for directory', { 
    directoryPath,
    metadataPath
  });
  
  try {
    // Load metadata
    const metadataMap = await loadDocumentMetadata(metadataPath);
    processingLogger.info('Loaded document metadata', { count: metadataMap.size });
    
    // Process files
    const files = fs.readdirSync(directoryPath)
      .filter(file => file.endsWith('.md'))
      .map(file => path.join(directoryPath, file));
    
    processingLogger.info('Found markdown files to process', { count: files.length });
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        processingLogger.info(`Processing file ${i+1}/${files.length}`, { file });
        await processMarkdownFileEnhanced(file, metadataMap);
      } catch (error) {
        processingLogger.error('Error processing file', { 
          file,
          error: (error as Error).message
        });
      }
    }
    
    processingLogger.info('Document processing complete', { 
      filesProcessed: files.length
    });
  } catch (error) {
    processingLogger.error('Error processing documents', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    throw error;
  }
} 