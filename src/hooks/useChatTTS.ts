'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface TTSOptions {
  voice?: string
  rate?: number
  pitch?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: Error) => void
}

interface TTSVoice {
  name: string
  lang: string
  default: boolean
}

interface UseChatTTSReturn {
  isAvailable: boolean
  isPlaying: boolean
  isPaused: boolean
  voices: TTSVoice[]
  error: string | null
  speak: (text: string, options?: TTSOptions) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setVoice: (voice: string) => void
  setRate: (rate: number) => void
  setPitch: (pitch: number) => void
  setVolume: (volume: number) => void
}

const DEFAULT_OPTIONS: Required<Omit<TTSOptions, 'voice'>> = {
  rate: 1,
  pitch: 1,
  volume: 1,
  onStart: () => {},
  onEnd: () => {},
  onError: () => {},
}

export function useChatTTS(): UseChatTTSReturn {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<string>('')
  const [rate, setRate] = useState(DEFAULT_OPTIONS.rate)
  const [pitch, setPitch] = useState(DEFAULT_OPTIONS.pitch)
  const [volume, setVolume] = useState(DEFAULT_OPTIONS.volume)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    const checkAvailability = () => {
      const available = 'speechSynthesis' in window
      setIsAvailable(available)

      if (available) {
        const loadVoices = () => {
          const availableVoices = window.speechSynthesis
            .getVoices()
            .map((voice) => ({
              name: voice.name,
              lang: voice.lang,
              default: voice.default,
            }))
          setVoices(availableVoices)

          // Set default voice
          if (!selectedVoice && availableVoices.length > 0) {
            const defaultVoice = availableVoices.find((v) => v.default)
            setSelectedVoice(defaultVoice?.name || availableVoices[0].name)
          }
        }

        loadVoices()
        window.speechSynthesis.onvoiceschanged = loadVoices
      }
    }

    checkAvailability()

    return () => {
      if (isAvailable) {
        window.speechSynthesis.cancel()
      }
    }
  }, [isAvailable, selectedVoice])

  const cleanup = useCallback(() => {
    if (utteranceRef.current) {
      window.speechSynthesis.cancel()
      utteranceRef.current = null
    }
    setIsPlaying(false)
    setIsPaused(false)
  }, [])

  const speak = useCallback(
    (text: string, options?: TTSOptions) => {
      if (!isAvailable) {
        setError('Text-to-speech is not available')
        return
      }

      try {
        cleanup()
        setError(null)

        const utterance = new SpeechSynthesisUtterance(text)
        utteranceRef.current = utterance

        // Set voice
        const voice = window.speechSynthesis
          .getVoices()
          .find((v) => v.name === (options?.voice || selectedVoice))
        if (voice) {
          utterance.voice = voice
        }

        // Set other options
        utterance.rate = options?.rate ?? rate
        utterance.pitch = options?.pitch ?? pitch
        utterance.volume = options?.volume ?? volume

        // Set event handlers
        utterance.onstart = () => {
          setIsPlaying(true)
          options?.onStart?.()
        }

        utterance.onend = () => {
          cleanup()
          options?.onEnd?.()
        }

        utterance.onerror = (event) => {
          cleanup()
          const errorMessage = event.error || 'Speech synthesis failed'
          setError(errorMessage)
          options?.onError?.(new Error(errorMessage))
        }

        window.speechSynthesis.speak(utterance)
      } catch (err) {
        cleanup()
        const errorMessage = err instanceof Error ? err.message : 'Speech synthesis failed'
        setError(errorMessage)
        options?.onError?.(new Error(errorMessage))
      }
    },
    [isAvailable, selectedVoice, rate, pitch, volume, cleanup]
  )

  const pause = useCallback(() => {
    if (isPlaying && !isPaused) {
      window.speechSynthesis.pause()
      setIsPaused(true)
    }
  }, [isPlaying, isPaused])

  const resume = useCallback(() => {
    if (isPlaying && isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
    }
  }, [isPlaying, isPaused])

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return {
    isAvailable,
    isPlaying,
    isPaused,
    voices,
    error,
    speak,
    pause,
    resume,
    stop,
    setVoice: setSelectedVoice,
    setRate,
    setPitch,
    setVolume,
  }
} 