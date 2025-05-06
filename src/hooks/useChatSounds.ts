'use client'

import { useState, useEffect, useCallback } from 'react'

interface Sound {
  name: string
  url: string
  audio?: HTMLAudioElement
}

interface UseChatSoundsReturn {
  isEnabled: boolean
  isLoading: boolean
  error: string | null
  toggleSound: () => void
  playSound: (name: string) => void
}

const sounds: Sound[] = [
  {
    name: 'message',
    url: '/sounds/message.mp3',
  },
  {
    name: 'notification',
    url: '/sounds/notification.mp3',
  },
  {
    name: 'error',
    url: '/sounds/error.mp3',
  },
]

export function useChatSounds(): UseChatSoundsReturn {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedSounds, setLoadedSounds] = useState<Sound[]>([])

  useEffect(() => {
    // Load saved preference
    const savedPreference = localStorage.getItem('soundEnabled')
    setIsEnabled(savedPreference === 'true')

    // Preload sounds
    const loadSounds = async () => {
      try {
        const loadedSoundPromises = sounds.map(async (sound) => {
          const audio = new Audio(sound.url)
          await audio.load()
          return { ...sound, audio }
        })

        const loadedSounds = await Promise.all(loadedSoundPromises)
        setLoadedSounds(loadedSounds)
        setIsLoading(false)
      } catch (err) {
        setError('Failed to load sounds')
        setIsLoading(false)
      }
    }

    loadSounds()
  }, [])

  useEffect(() => {
    localStorage.setItem('soundEnabled', isEnabled.toString())
  }, [isEnabled])

  const toggleSound = useCallback(() => {
    setIsEnabled((prev) => !prev)
  }, [])

  const playSound = useCallback(
    (name: string) => {
      if (!isEnabled || isLoading) return

      const sound = loadedSounds.find((s) => s.name === name)
      if (sound?.audio) {
        try {
          sound.audio.currentTime = 0
          sound.audio.play()
        } catch (err) {
          console.error('Failed to play sound:', err)
        }
      }
    },
    [isEnabled, isLoading, loadedSounds]
  )

  return {
    isEnabled,
    isLoading,
    error,
    toggleSound,
    playSound,
  }
} 