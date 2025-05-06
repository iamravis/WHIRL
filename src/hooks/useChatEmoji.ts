'use client'

import { useState, useEffect, useCallback } from 'react'
import emojiData from 'emoji-datasource'

interface Emoji {
  unified: string
  name: string
  shortName: string
  category: string
  subcategory: string
  keywords: string[]
}

interface UseChatEmojiReturn {
  emojis: Emoji[]
  recentEmojis: Emoji[]
  isLoading: boolean
  error: string | null
  searchEmojis: (query: string) => Emoji[]
  addRecentEmoji: (emoji: Emoji) => void
  clearRecentEmojis: () => void
  getEmojiByShortName: (shortName: string) => Emoji | undefined
  replaceEmojiShortcodes: (text: string) => string
}

const MAX_RECENT_EMOJIS = 30

export function useChatEmoji(): UseChatEmojiReturn {
  const [emojis, setEmojis] = useState<Emoji[]>([])
  const [recentEmojis, setRecentEmojis] = useState<Emoji[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // Transform emoji data into our format
      const transformedEmojis = emojiData.map((emoji: any) => ({
        unified: emoji.unified,
        name: emoji.name,
        shortName: emoji.short_name,
        category: emoji.category,
        subcategory: emoji.subcategory,
        keywords: emoji.keywords || [],
      }))

      setEmojis(transformedEmojis)

      // Load recent emojis from localStorage
      const savedRecents = localStorage.getItem('recentEmojis')
      if (savedRecents) {
        setRecentEmojis(JSON.parse(savedRecents))
      }

      setIsLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emojis')
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Save recent emojis to localStorage
    localStorage.setItem('recentEmojis', JSON.stringify(recentEmojis))
  }, [recentEmojis])

  const searchEmojis = useCallback(
    (query: string) => {
      if (!query.trim()) return []

      const searchTerms = query.toLowerCase().split(' ')
      return emojis.filter((emoji) => {
        return searchTerms.every(
          (term) =>
            emoji.name.toLowerCase().includes(term) ||
            emoji.shortName.toLowerCase().includes(term) ||
            emoji.keywords.some((keyword) => keyword.toLowerCase().includes(term))
        )
      })
    },
    [emojis]
  )

  const addRecentEmoji = useCallback(
    (emoji: Emoji) => {
      setRecentEmojis((prev) => {
        const filtered = prev.filter((e) => e.unified !== emoji.unified)
        return [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS)
      })
    },
    []
  )

  const clearRecentEmojis = useCallback(() => {
    setRecentEmojis([])
    localStorage.removeItem('recentEmojis')
  }, [])

  const getEmojiByShortName = useCallback(
    (shortName: string) => {
      return emojis.find((emoji) => emoji.shortName === shortName)
    },
    [emojis]
  )

  const replaceEmojiShortcodes = useCallback(
    (text: string) => {
      return text.replace(/:([\w+-]+):/g, (match, shortName) => {
        const emoji = getEmojiByShortName(shortName)
        if (emoji) {
          return String.fromCodePoint(
            ...emoji.unified.split('-').map((hex) => parseInt(hex, 16))
          )
        }
        return match
      })
    },
    [getEmojiByShortName]
  )

  return {
    emojis,
    recentEmojis,
    isLoading,
    error,
    searchEmojis,
    addRecentEmoji,
    clearRecentEmojis,
    getEmojiByShortName,
    replaceEmojiShortcodes,
  }
} 