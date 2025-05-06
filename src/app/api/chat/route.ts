import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import prisma from '@/lib/prisma'
import { authOptions } from '@/lib/auth'

const GEMMA_API_URL = process.env.GEMMA_API_URL || 'http://localhost:8080'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json();
    const { message, chatId: initialChatId, messages: clientMessages, processMath, useApi, apiProvider = 'nebius' } = body;
    
    // Log the API selection received from client
    console.log(`API selection from client: ${useApi ? `Using ${apiProvider} API` : 'Using local model'}`);

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let chat = null

    // If chatId provided, verify it belongs to user
    if (initialChatId) {
      chat = await prisma.chat.findUnique({
        where: {
          id: initialChatId,
          userId: user.id, // Ensure chat belongs to current user
        },
      })

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found or unauthorized' }, { status: 404 })
      }
    } else {
      // Create a new chat
      const title = message.substring(0, 30) + '...'
      chat = await prisma.chat.create({
        data: {
          title,
          userId: user.id,
        },
      })
    }

    // Save user message to database
    const userMessage = await prisma.message.create({
      data: {
        content: message,
        role: 'user',
        chatId: chat.id,
        userId: user.id,
      },
    })

    // Get chat history for this specific chat only
    const chatMessages = await prisma.message.findMany({
      where: { 
        chatId: chat.id,
        userId: user.id // Ensure we only get messages from this user
      },
      orderBy: { createdAt: 'asc' },
      take: 10, // Limit to last 10 messages
    })

    // Format chat history for the inference server
    const chatHistory = chatMessages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }))

    // Make API call to inference server
    const inferenceServerUrl = process.env.GEMMA_INFERENCE_SERVER_URL || 'http://localhost:8080/generate'
    console.log(`Making request to inference server at ${inferenceServerUrl}`)

    // Format the API payload
    const apiPayload = {
      messages: chatHistory,
      temperature: 0.7,
      max_tokens: 4096,
      top_p: 0.95,
      top_k: 40,
      include_thinking: useApi, // Include thinking content when using API
      use_api: Boolean(useApi),
      api_provider: apiProvider, // Pass the API provider selection
      streaming: true,
      chat_id: initialChatId
    }

    // Make the API call and get streaming response
    const response = await fetch(inferenceServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(JSON.stringify({ error: errorText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Save the chat first to get an ID if needed
    let effectiveId = initialChatId
    if (!initialChatId) {
      // Create a new chat in the database
      try {
        const chat = await prisma.chat.create({
          data: {
            userId: session.user.id,
            title: message.substring(0, 50) + '...',
          },
        })
        effectiveId = chat.id
        console.log(`Created new chat with ID ${chat.id}`)
      } catch (error) {
        console.error('Error creating chat:', error)
      }
    }

    // Use our custom streaming response handler that preserves thinking content
    const stream = await streamResponse(response, effectiveId, chatHistory)
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error processing chat request:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find the user to get their ID
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get('chatId')

    if (chatId) {
      // Add userId to the where clause to ensure it belongs to current user
      const chat = await prisma.chat.findUnique({
        where: { 
          id: chatId,
          userId: user.id // Ensure chat belongs to current user
        },
        include: { 
          messages: {
            orderBy: { createdAt: 'asc' } // Order messages chronologically
          } 
        },
      })

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
      }

      return NextResponse.json({ chat, messages: chat.messages })
    }

    const chats = await prisma.chat.findMany({
      where: { userId: user.id }, // Using the user ID from the database query
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    return NextResponse.json({ chats })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find user to get their ID
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get('chatId')

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 })
    }

    // First check if chat exists and belongs to this user
    const chat = await prisma.chat.findUnique({
      where: { 
        id: chatId,
        userId: user.id // Ensure chat belongs to current user
      },
    })

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found or unauthorized' }, { status: 404 })
    }

    // Delete all messages in this chat first
    await prisma.message.deleteMany({
      where: {
        chatId: chatId
      }
    });

    // Then delete the chat
    await prisma.chat.delete({
      where: { id: chatId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Function to stream response
const streamResponse = async (
  response: Response,
  chatId: string | null,
  prevMessages: { role: string; content: string }[]
) => {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body available')
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ''
  let assistantMessage = ''
  let thinkingContent = '' // Add variable for thinking content
  let processingThinking = false // Flag to track if we're currently inside a <think> tag
  
  // Helper to detect thinking content
  const processThinking = (text: string) => {
    // Check if text has <think> tags
    const thinkStart = '<think>'
    const thinkEnd = '</think>'
    
    if (text.includes(thinkStart) && !processingThinking) {
      processingThinking = true
      const startIdx = text.indexOf(thinkStart)
      const beforeThink = text.slice(0, startIdx)
      
      if (beforeThink.trim()) {
        assistantMessage += beforeThink
      }
      
      thinkingContent += text.slice(startIdx + thinkStart.length)
      
      // Check if the thinking section ends in this chunk
      if (text.includes(thinkEnd)) {
        const endIdx = thinkingContent.lastIndexOf(thinkEnd)
        const afterThink = thinkingContent.slice(endIdx + thinkEnd.length)
        thinkingContent = thinkingContent.slice(0, endIdx)
        processingThinking = false
        
        if (afterThink.trim()) {
          assistantMessage += afterThink
        }
      }
    } else if (processingThinking) {
      // If we're in the middle of thinking content
      if (text.includes(thinkEnd)) {
        const endIdx = text.indexOf(thinkEnd)
        thinkingContent += text.slice(0, endIdx)
        processingThinking = false
        
        // Add any content after the </think> tag
        const afterThink = text.slice(endIdx + thinkEnd.length)
        if (afterThink.trim()) {
          assistantMessage += afterThink
        }
      } else {
        // Still inside thinking block
        thinkingContent += text
      }
    } else {
      // Regular content
      assistantMessage += text
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Helper function to push a JSON message to the stream
      const push = (token: string) => {
        const message = JSON.stringify({ token })
        controller.enqueue(encoder.encode(message + '\n'))
      }

      try {
        // First message with chat ID
        if (chatId) {
          controller.enqueue(encoder.encode(JSON.stringify({ chat: { id: chatId } }) + '\n'))
        }

        // Track time for buffered updates
        let lastPushTime = Date.now();
        let bufferedContent = '';
        let lastSentLength = 0; // To track how much content we've already sent
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          let decoded = decoder.decode(value, { stream: true })
          
          // Clean template markers and model tokens before processing
          decoded = decoded
            .replace("<!-- RAG response will be properly formatted after initial generation -->", "")
            .replace("</|assistant>|>", "")
          
          buffer += decoded
          
          // Process buffer and extract tokens
          if (buffer) {
            // Check for thinking content and handle it
            processThinking(buffer)
            
            // Reset buffer after processing
            buffer = ''
            
            // Buffer content and push less frequently
            const currentTime = Date.now();
            
            // Accumulate content in the buffer
            const currentContent = assistantMessage + 
              (thinkingContent.length > 0 ? `<think>${thinkingContent}</think>` : '');
            
            // FIXED: Only push the new part of the content instead of the entire accumulated content
            if (!lastPushTime || (currentTime - lastPushTime > 200)) {
              // Get only the new content since the last update
              if (currentContent.length > lastSentLength) {
                const newContent = currentContent.substring(lastSentLength);
                push(newContent);
                lastSentLength = currentContent.length;
              }
              lastPushTime = currentTime;
            }
          }
        }

        // Process any remaining buffer
        if (buffer) {
          processThinking(buffer)
        }
        
        // Send any remaining unsent content
        const finalContent = assistantMessage + 
          (thinkingContent.length > 0 ? `<think>${thinkingContent}</think>` : '');
          
        // Only send the part we haven't sent yet
        if (finalContent.length > lastSentLength) {
          const remainingContent = finalContent.substring(lastSentLength);
          if (remainingContent.length > 0) {
            push(remainingContent);
          }
        }
        
        // Send a completion message
        controller.enqueue(encoder.encode(JSON.stringify({ complete: true }) + '\n'))
        
      } catch (error) {
        controller.error(error)
      } finally {
        controller.close()
        reader.releaseLock()
      }
    }
  })

  return stream
} 