'use client'

import { useState, useEffect } from 'react'

interface ChatTheme {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  fontFamily: string
  fontSize: string
  messageSpacing: string
  borderRadius: string
  userMessageBg: string
  assistantMessageBg: string
}

interface UseChatThemeReturn {
  theme: ChatTheme
  isDarkMode: boolean
  toggleDarkMode: () => void
  updateTheme: (updates: Partial<ChatTheme>) => void
  resetTheme: () => void
}

const defaultLightTheme: ChatTheme = {
  primaryColor: '#2563eb',
  secondaryColor: '#6b7280',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '16px',
  messageSpacing: '1rem',
  borderRadius: '0.5rem',
  userMessageBg: '#f3f4f6',
  assistantMessageBg: '#e5e7eb',
}

const defaultDarkTheme: ChatTheme = {
  primaryColor: '#3b82f6',
  secondaryColor: '#9ca3af',
  backgroundColor: '#111827',
  textColor: '#f9fafb',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '16px',
  messageSpacing: '1rem',
  borderRadius: '0.5rem',
  userMessageBg: '#1f2937',
  assistantMessageBg: '#374151',
}

export function useChatTheme(): UseChatThemeReturn {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [theme, setTheme] = useState<ChatTheme>(defaultLightTheme)

  useEffect(() => {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDarkMode(prefersDark)

    // Load saved theme from localStorage
    const savedTheme = localStorage.getItem('chatTheme')
    if (savedTheme) {
      setTheme(JSON.parse(savedTheme))
    }
  }, [])

  useEffect(() => {
    // Update theme when dark mode changes
    setTheme(isDarkMode ? defaultDarkTheme : defaultLightTheme)
  }, [isDarkMode])

  useEffect(() => {
    // Save theme to localStorage
    localStorage.setItem('chatTheme', JSON.stringify(theme))

    // Apply theme to document root
    const root = document.documentElement
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--chat-${key}`, value)
    })
  }, [theme])

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev)
  }

  const updateTheme = (updates: Partial<ChatTheme>) => {
    setTheme((prev) => ({ ...prev, ...updates }))
  }

  const resetTheme = () => {
    setTheme(isDarkMode ? defaultDarkTheme : defaultLightTheme)
  }

  return {
    theme,
    isDarkMode,
    toggleDarkMode,
    updateTheme,
    resetTheme,
  }
} 