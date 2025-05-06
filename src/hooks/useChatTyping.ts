'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface TypingOptions {
  minDelay?: number
  maxDelay?: number
  initialDelay?: number
  onCharacterTyped?: (char: string, index: number) => void
  onComplete?: () => void
}

interface UseChatTypingReturn {
  displayedText: string
  isTyping: boolean
  progress: number
  startTyping: (text: string, options?: TypingOptions) => void
  stopTyping: () => void
  skipToEnd: () => void
}

const DEFAULT_OPTIONS: Required<TypingOptions> = {
  minDelay: 20,
  maxDelay: 100,
  initialDelay: 500,
  onCharacterTyped: () => {},
  onComplete: () => {},
}

export function useChatTyping(): UseChatTypingReturn {
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [progress, setProgress] = useState(0)
  const fullTextRef = useRef('')
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const getRandomDelay = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  const typeNextCharacter = useCallback(
    (
      currentIndex: number,
      text: string,
      { minDelay, maxDelay, onCharacterTyped, onComplete }: Required<TypingOptions>
    ) => {
      if (currentIndex >= text.length) {
        setIsTyping(false)
        onComplete()
        return
      }

      const char = text[currentIndex]
      setDisplayedText((prev) => prev + char)
      setProgress((currentIndex + 1) / text.length)
      onCharacterTyped(char, currentIndex)

      // Calculate delay based on character type
      let delay = getRandomDelay(minDelay, maxDelay)
      if (char === ' ') delay *= 1.5 // Longer pause for spaces
      if (/[.,!?]/.test(char)) delay *= 2 // Even longer pause for punctuation

      timeoutRef.current = setTimeout(() => {
        typeNextCharacter(currentIndex + 1, text, {
          minDelay,
          maxDelay,
          onCharacterTyped,
          onComplete,
        })
      }, delay)
    },
    []
  )

  const startTyping = useCallback(
    (text: string, options?: TypingOptions) => {
      cleanup()
      setDisplayedText('')
      setProgress(0)
      setIsTyping(true)
      fullTextRef.current = text

      const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

      timeoutRef.current = setTimeout(() => {
        typeNextCharacter(0, text, mergedOptions)
      }, mergedOptions.initialDelay)
    },
    [cleanup, typeNextCharacter]
  )

  const stopTyping = useCallback(() => {
    cleanup()
    setIsTyping(false)
  }, [cleanup])

  const skipToEnd = useCallback(() => {
    cleanup()
    setDisplayedText(fullTextRef.current)
    setProgress(1)
    setIsTyping(false)
  }, [cleanup])

  return {
    displayedText,
    isTyping,
    progress,
    startTyping,
    stopTyping,
    skipToEnd,
  }
} 