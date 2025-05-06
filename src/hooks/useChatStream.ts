'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface StreamOptions {
  onToken?: (token: string) => void
  onComplete?: (fullText: string) => void
  onError?: (error: Error) => void
}

interface UseChatStreamReturn {
  isStreaming: boolean
  streamedText: string
  error: string | null
  startStream: (message: string, options?: StreamOptions) => void
  stopStream: () => void
}

export function useChatStream(): UseChatStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const startStream = useCallback(
    async (message: string, options?: StreamOptions) => {
      try {
        cleanup()
        setError(null)
        setStreamedText('')
        setIsStreaming(true)

        abortControllerRef.current = new AbortController()

        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          throw new Error('Stream request failed')
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let accumulatedText = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            options?.onComplete?.(accumulatedText)
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          accumulatedText += chunk
          setStreamedText(accumulatedText)
          options?.onToken?.(chunk)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        const errorMessage = err instanceof Error ? err.message : 'Stream failed'
        setError(errorMessage)
        options?.onError?.(err instanceof Error ? err : new Error(errorMessage))
      } finally {
        cleanup()
      }
    },
    [cleanup]
  )

  const stopStream = useCallback(() => {
    cleanup()
  }, [cleanup])

  return {
    isStreaming,
    streamedText,
    error,
    startStream,
    stopStream,
  }
} 