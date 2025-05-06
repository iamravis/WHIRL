'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface STTOptions {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
  onResult?: (result: string, isFinal: boolean) => void
  onError?: (error: Error) => void
}

interface UseChatSTTReturn {
  isAvailable: boolean
  isListening: boolean
  transcript: string
  error: string | null
  startListening: (options?: STTOptions) => void
  stopListening: () => void
}

const DEFAULT_OPTIONS: Required<STTOptions> = {
  language: 'en-US',
  continuous: true,
  interimResults: true,
  maxAlternatives: 1,
  onResult: () => {},
  onError: () => {},
}

export function useChatSTT(): UseChatSTTReturn {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    // Check if browser supports speech recognition
    const checkAvailability = () => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition
      setIsAvailable(!!SpeechRecognition)
    }

    checkAvailability()
  }, [])

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const startListening = useCallback(
    (options?: STTOptions) => {
      if (!isAvailable) {
        setError('Speech recognition is not available')
        return
      }

      try {
        cleanup()
        setError(null)
        setTranscript('')

        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        recognitionRef.current = recognition

        const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

        recognition.lang = mergedOptions.language
        recognition.continuous = mergedOptions.continuous
        recognition.interimResults = mergedOptions.interimResults
        recognition.maxAlternatives = mergedOptions.maxAlternatives

        recognition.onstart = () => {
          setIsListening(true)
        }

        recognition.onresult = (event) => {
          const result = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join(' ')

          const isFinal = event.results[event.results.length - 1].isFinal
          setTranscript(result)
          mergedOptions.onResult(result, isFinal)
        }

        recognition.onerror = (event) => {
          cleanup()
          const errorMessage = event.error || 'Speech recognition failed'
          setError(errorMessage)
          mergedOptions.onError(new Error(errorMessage))
        }

        recognition.onend = () => {
          cleanup()
        }

        recognition.start()
      } catch (err) {
        cleanup()
        const errorMessage = err instanceof Error ? err.message : 'Speech recognition failed'
        setError(errorMessage)
        options?.onError?.(new Error(errorMessage))
      }
    },
    [isAvailable, cleanup]
  )

  const stopListening = useCallback(() => {
    cleanup()
  }, [cleanup])

  return {
    isAvailable,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  }
} 