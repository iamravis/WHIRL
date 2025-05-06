import { NextResponse } from 'next/server'

const GEMMA_API_URL = process.env.GEMMA_API_URL || 'http://localhost:8000'

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // --- Dynamically import RAG functions --- 
    const { getQueryContext, isGeneralConversation } = await import('@/lib/rag/vectorSearch');
    // --- End Dynamic Import ---

    // Determine if query is medical/domain-specific or general conversation
    const isGeneral = isGeneralConversation(message)
    
    // Only retrieve context for non-general medical queries
    let context = ""
    if (!isGeneral) {
      // Get relevant context for the query
      context = await getQueryContext(message)
    }
    
    // Prepare the model prompt
    const modelPrompt = context 
      ? `I'll help you answer a question about women's health. Here's relevant information:\n\n${context}\n\nUser Question: ${message}`
      : message
    
    // Detect if we have no context for a non-general query
    const isOutOfDomain = !isGeneral && !context
    
    // Add system message for out-of-domain queries
    const systemMessage = isOutOfDomain 
      ? "If the user asks about topics outside of women's health where no relevant context is provided, apologize and explain that you're focused on providing information about women's health. For example: 'Sorry I'm not able to provide information on that specific topic. However, I can offer some general resources and guidance on women's health if that would be helpful.'"
      : undefined

    // Call the Gemma inference API with context
    const response = await fetch(`${GEMMA_API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: modelPrompt,
        history: history || [],
        system_message: systemMessage,
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemma API error: ${response.statusText}`)
    }

    const data = await response.json()
    
    // Add metadata about the RAG process to the response
    return NextResponse.json({
      ...data,
      meta: {
        ragEnabled: true,
        contextProvided: !!context,
        isGeneralQuery: isGeneral,
        isOutOfDomain: isOutOfDomain,
      }
    })
  } catch (error) {
    console.error('Gemma API error:', error)
    return NextResponse.json(
      { error: 'Failed to get response from Gemma model' },
      { status: 500 }
    )
  }
} 