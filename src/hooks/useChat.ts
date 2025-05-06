'use client'

import { useState, useCallback, useEffect } from 'react'
import { fetchApi } from '@/lib/api'
import { v4 as uuidv4 } from 'uuid'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  createdAt: string
}

interface Chat {
  id: string
  title: string
  createdAt: string
  messages: Message[]
}

interface UseChatReturn {
  chats: Chat[]
  currentChat: Chat | null
  messages: Message[]
  isLoading: boolean
  error: string | null
  createNewChat: () => Promise<void>
  selectChat: (chatId: string) => Promise<void>
  sendMessage: (message: string) => Promise<void>
  deleteChat: (chatId: string) => Promise<void>
}

export function useChat(): UseChatReturn {
  const [chats, setChats] = useState<Chat[]>([])
  const [currentChat, setCurrentChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  useEffect(() => {
    loadChatList()
  }, [])

  const loadChatList = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.log("No token found for loading chat list.")
      setChats([])
      return
    }
    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/chats/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      })
      if (!response.ok) {
        if (response.status === 401) {
          console.error("Load chats failed (401): Token invalid?")
          setError("Authentication error loading chats. Please log in again.")
        } else {
          throw new Error(`Failed to fetch chats: ${response.status}`)
        }
        setChats([])
      } else {
        const data = await response.json()
        setChats(data || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch chats')
      setChats([])
    }
  }, [])

  const createNewChat = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setCurrentChat(null)
    setMessages([])
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setIsLoading(false)
  }, [abortController])

  const selectChat = useCallback(async (chatId: string) => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.log("No token found for selecting chat.")
      setError("Authentication required to select chat.")
      return
    }
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setIsLoading(false)
    }
    setIsLoading(true)
    setError(null)
    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/chats/${chatId}/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        }
      })
      if (!response.ok) {
        if (response.status === 401) {
          console.error("Select chat failed (401): Token invalid?")
          setError("Authentication error selecting chat. Please log in again.")
        } else {
          throw new Error(`Failed to select chat: ${response.status}`)
        }
        setCurrentChat(null)
        setMessages([])
      } else {
        const chatDetail = await response.json()
        setCurrentChat(chatDetail)
        setMessages(chatDetail.messages || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select chat')
      setCurrentChat(null)
      setMessages([])
    } finally {
      setIsLoading(false)
    }
  }, [abortController])

  const sendMessage = useCallback(async (messageContent: string) => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setError("You must be logged in to send messages.")
      return
    }
    if (isLoading) return

    setError(null)
    setIsLoading(true)

    const userMessage: Message = {
      id: uuidv4(),
      content: messageContent,
      role: 'user',
      createdAt: new Date().toISOString(),
    }
    const assistantMessageId = uuidv4()
    const assistantMessagePlaceholder: Message = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      createdAt: new Date().toISOString(),
    }
    setMessages((prevMessages) => [...prevMessages, userMessage, assistantMessagePlaceholder])

    const currentChatId = currentChat?.id
    const controller = new AbortController()
    setAbortController(controller)
    const { signal } = controller
    
    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageContent,
          session_id: currentChatId,
        }),
        signal,
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.error("Send message failed (401): Token invalid?")
          setError("Authentication error sending message. Please log in again.")
          setMessages(prev => prev.filter(msg => msg.id !== userMessage.id && msg.id !== assistantMessagePlaceholder.id))
        } else {
          const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }))
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
        }
        setIsLoading(false)
        setAbortController(null)
        return
      }

      if (!response.body) {
        throw new Error('Response body is missing')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let firstChunkReceived = false

      console.log(`[useChat] Starting stream reader loop for assistant message ${assistantMessageId}`)

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log("[useChat] Stream reader finished (done=true).")
          break
        }

        const decodedChunk = decoder.decode(value, { stream: true })
        console.debug("[useChat] Received Decoded Chunk:", JSON.stringify(decodedChunk))
        buffer += decodedChunk
        const lines = buffer.split('\n\n')
        console.debug(`[useChat] Split into ${lines.length} lines. Buffer contains:`, JSON.stringify(buffer))
        buffer = lines.pop() || ''

        for (const line of lines) {
          console.debug("[useChat] Processing Line:", JSON.stringify(line))
          if (line.startsWith('event: end')) {
            console.log("[useChat] Stream ended by server event (event: end).")
            break
          } else if (line.startsWith('event: error')) {
            const errorJson = line.substring(line.indexOf('data:') + 5).trim()
            console.error("[useChat] Received Error Event Line:", line)
            let errorPayload = { error: 'Failed to parse error event' }
            try {
              errorPayload = JSON.parse(errorJson)
            } catch (e) {
              console.error("Failed to parse error event JSON:", errorJson, e)
            }
            console.error('[useChat] SSE Error Payload:', errorPayload)
            setError(`Assistant Error: ${errorPayload.error || 'Unknown error'}`)
            reader.cancel("Received error event from server")
            break
          } else if (line.startsWith('data:')) {
            const dataJson = line.substring(5).trim()
            console.debug("[useChat] Received Data Line JSON:", dataJson)
            try {
              const data = JSON.parse(dataJson)
              console.debug("[useChat] Parsed Data:", data)
              if (data.token) {
                setMessages((prevMessages) => {
                  console.debug("[useChat] setMessages callback. Prev Messages Count:", prevMessages.length, "Target ID:", assistantMessageId);
                  const updatedMessages = prevMessages.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.token }
                      : msg
                  )
                  const updatedMsg = updatedMessages.find(m => m.id === assistantMessageId);
                  console.debug("[useChat] Updated Assistant Message Content:", updatedMsg ? JSON.stringify(updatedMsg.content) : 'Not Found');
                  return updatedMessages
                })
              } else if (data.sources) {
                console.log("[useChat] Received sources event:", data.sources);
              }
            } catch (e) {
              console.error("Failed to parse data JSON or update state:", dataJson, e)
            }
          } else if (line.trim()) {
            console.warn("[useChat] Received unexpected non-empty line:", JSON.stringify(line));
          }
        }
        if (line.startsWith('event: end') || line.startsWith('event: error')) {
          console.log("[useChat] Breaking outer loop due to end/error event.")
          break;
        }
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Fetch aborted by user')
        setError('Message cancelled.')
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessagePlaceholder.id))
      } else {
        console.error('Error sending message or reading stream:', error)
        setError(error instanceof Error ? error.message : 'An unknown error occurred')
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessagePlaceholder.id))
      }
    } finally {
      setIsLoading(false)
      setAbortController(null)
      console.log("[useChat] sendMessage finished.")
    }
  }, [currentChat, isLoading, abortController, loadChatList])

  const deleteChat = useCallback(async (chatId: string) => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.log("No token found for deleting chat.")
      setError("Authentication required to delete chat.")
      return
    }
    if (currentChat?.id === chatId && abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setIsLoading(true)
    setError(null)
    try {
      const apiUrl = getApiUrl()
      const response = await fetch(`${apiUrl}/api/chats/${chatId}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      })
      if (!response.ok) {
        if (response.status === 401) {
          console.error("Delete chat failed (401): Token invalid?")
          setError("Authentication error deleting chat. Please log in again.")
        } else {
          throw new Error(`Failed to delete chat: ${response.status}`)
        }
      } else {
        if (currentChat?.id === chatId) {
          setCurrentChat(null)
          setMessages([])
        }
        await loadChatList()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chat')
    } finally {
      setIsLoading(false)
    }
  }, [currentChat?.id, loadChatList, abortController])

  return {
    chats,
    currentChat,
    messages,
    isLoading,
    error,
    createNewChat,
    selectChat,
    sendMessage,
    deleteChat,
  }
} 