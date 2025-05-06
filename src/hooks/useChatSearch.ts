'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Fuse from 'fuse.js'

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

interface SearchResult {
  chat: Chat
  matches: {
    message: Message
    highlights: {
      key: 'content'
      indices: [number, number][]
      value: string
    }[]
  }[]
}

interface UseChatSearchReturn {
  searchTerm: string
  searchResults: SearchResult[]
  isSearching: boolean
  error: string | null
  setSearchTerm: (term: string) => void
  clearSearch: () => void
}

const fuseOptions = {
  includeMatches: true,
  threshold: 0.3,
  keys: ['messages.content'],
}

export function useChatSearch(chats: Chat[]): UseChatSearchReturn {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create Fuse instance for searching
  const fuse = useMemo(() => {
    const documents = chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((msg) => ({
        ...msg,
        content: msg.content.toLowerCase(),
      })),
    }))
    return new Fuse(documents, fuseOptions)
  }, [chats])

  // Debounced search function
  const debouncedSearch = useCallback(
    (term: string) => {
      if (!term.trim()) {
        setSearchResults([])
        return
      }

      try {
        setIsSearching(true)
        setError(null)

        const results = fuse.search(term.toLowerCase())
        const formattedResults: SearchResult[] = results.map((result) => {
          const chat = result.item
          const matches = result.matches?.map((match) => ({
            message: chat.messages.find((msg) => msg.content === match.value)!,
            highlights: match.indices.map((indices) => ({
              key: 'content' as const,
              indices,
              value: match.value,
            })),
          }))

          return {
            chat,
            matches: matches || [],
          }
        })

        setSearchResults(formattedResults)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    },
    [fuse]
  )

  // Handle search term changes with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      debouncedSearch(searchTerm)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchTerm, debouncedSearch])

  const clearSearch = useCallback(() => {
    setSearchTerm('')
    setSearchResults([])
  }, [])

  return {
    searchTerm,
    searchResults,
    isSearching,
    error,
    setSearchTerm,
    clearSearch,
  }
} 