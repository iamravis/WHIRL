import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/rag/vectorSearch';
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Initialize Prisma client
const prisma = new PrismaClient();

// Configure API logger
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const apiLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { component: 'rag-api' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'api-error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'api.log') 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

// Track user interaction directly in the API
async function trackInteraction(data: {
  userId?: string;
  sessionId?: string;
  query: string;
  retrievedChunks: any[];
  response: string;
  modelUsed: string;
  retrievalLatency: number;
  totalLatency: number;
}) {
  const startTime = Date.now();
  
  try {
    // Store in database
    const interaction = await prisma.interaction.create({
      data: {
        userId: data.userId || 'anonymous',
        sessionId: data.sessionId,
        query: data.query,
        retrievedChunks: JSON.stringify(data.retrievedChunks),
        response: data.response,
        modelUsed: data.modelUsed,
        ragEnabled: true,
        retrievalLatency: data.retrievalLatency,
        totalLatency: data.totalLatency,
      },
    });
    
    // Log to file for redundancy
    const logEntry = JSON.stringify({
      ...data,
      id: interaction.id,
      timestamp: new Date().toISOString(),
    });
    
    fs.appendFileSync(
      path.join(logsDir, 'interactions.jsonl'), 
      logEntry + '\n'
    );
    
    apiLogger.info('Interaction tracked successfully', {
      interactionId: interaction.id,
      trackingLatency: Date.now() - startTime,
    });
    
    return interaction.id;
  } catch (error) {
    apiLogger.error('Failed to track interaction', {
      error: (error as Error).message,
      data,
    });
    
    // Try to at least log to file if database fails
    try {
      const logEntry = JSON.stringify({
        ...data,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
      
      fs.appendFileSync(
        path.join(logsDir, 'interactions.jsonl'), 
        logEntry + '\n'
      );
    } catch (fileError) {
      apiLogger.error('Failed to log interaction to file', {
        error: (fileError as Error).message,
      });
    }
    
    return null;
  }
}

export async function POST(request: NextRequest) {
  const apiStartTime = Date.now();
  
  try {
    const { query, userId, sessionId, maxResults = 5 } = await request.json();
    
    apiLogger.info('RAG query received', {
      query,
      userId,
      sessionId,
    });
    
    // Perform search
    const retrievalStartTime = Date.now();
    const results = await semanticSearch(query, maxResults);
    const retrievalLatency = Date.now() - retrievalStartTime;
    
    apiLogger.info('Retrieval completed', {
      retrievalLatency,
      resultCount: results.length,
    });
    
    // Format response for the model
    const context = results.map(r => `${r.content}\n\nSource: ${r.title || 'Unknown'}`).join('\n\n');
    const response = {
      context,
      results,
      stats: {
        retrievalLatency,
        totalLatency: Date.now() - apiStartTime,
      }
    };
    
    // Track this interaction 
    await trackInteraction({
      userId,
      sessionId,
      query,
      retrievedChunks: results,
      response: context,
      modelUsed: 'llama-3b',
      retrievalLatency,
      totalLatency: Date.now() - apiStartTime,
    });
    
    return NextResponse.json(response);
  } catch (error) {
    apiLogger.error('RAG API error', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    return NextResponse.json(
      { error: 'Failed to process query' },
      { status: 500 }
    );
  }
} 