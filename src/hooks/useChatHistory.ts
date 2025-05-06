'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/api'

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

interface UseChatHistoryReturn {
  history: Message[]
  addMessage: (message: Message) => void
  clearHistory: () => void
  loadHistory: (chatId: string) => Promise<void>
  saveHistory: () => Promise<void>
}

export function useChatHistory(chatId?: string): UseChatHistoryReturn {
  const { data: session } = useSession()
  const [history, setHistory] = useState<Message[]>([])

  useEffect(() => {
    if (chatId) {
      loadHistory(chatId)
    }
  }, [chatId])

  const addMessage = (message: Message) => {
    setHistory((prev) => [...prev, message])
  }

  const clearHistory = () => {
    setHistory([])
  }

  const loadHistory = async (chatId: string) => {
    try {
      const { messages } = await fetchApi<{ messages: Message[] }>(
        `/api/chat?chatId=${chatId}`
      )
      setHistory(messages)
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }

  const saveHistory = async () => {
    if (!chatId || !session?.user) return

    try {
      await fetchApi('/api/chat', {
        method: 'PUT',
        body: JSON.stringify({
          chatId,
          messages: history,
        }),
      })
    } catch (error) {
      console.error('Failed to save chat history:', error)
    }
  }

  // Save history when component unmounts
  useEffect(() => {
    return () => {
      if (history.length > 0) {
        saveHistory()
      }
    }
  }, [history])

  return {
    history,
    addMessage,
    clearHistory,
    loadHistory,
    saveHistory,
  }
} 