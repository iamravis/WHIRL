'use client'

import { useState, useEffect } from 'react'

interface ChatSettings {
  autoScroll: boolean
  showTimestamps: boolean
  showAvatars: boolean
  enableMarkdown: boolean
  enableCodeHighlighting: boolean
  enableEmoji: boolean
  soundEnabled: boolean
  notificationsEnabled: boolean
  fontSize: 'small' | 'medium' | 'large'
  messageAlignment: 'left' | 'right'
  bubbleStyle: 'modern' | 'classic' | 'minimal'
}

interface UseChatSettingsReturn {
  settings: ChatSettings
  updateSettings: (updates: Partial<ChatSettings>) => void
  resetSettings: () => void
}

const defaultSettings: ChatSettings = {
  autoScroll: true,
  showTimestamps: true,
  showAvatars: true,
  enableMarkdown: true,
  enableCodeHighlighting: true,
  enableEmoji: true,
  soundEnabled: false,
  notificationsEnabled: false,
  fontSize: 'medium',
  messageAlignment: 'left',
  bubbleStyle: 'modern',
}

export function useChatSettings(): UseChatSettingsReturn {
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings)

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('chatSettings')
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings))
    }
  }, [])

  useEffect(() => {
    // Save settings to localStorage
    localStorage.setItem('chatSettings', JSON.stringify(settings))

    // Apply settings to document root
    const root = document.documentElement
    root.style.setProperty('--chat-font-size', getFontSize(settings.fontSize))
    root.dataset.bubbleStyle = settings.bubbleStyle
    root.dataset.messageAlignment = settings.messageAlignment
  }, [settings])

  const updateSettings = (updates: Partial<ChatSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }))
  }

  const resetSettings = () => {
    setSettings(defaultSettings)
  }

  return {
    settings,
    updateSettings,
    resetSettings,
  }
}

function getFontSize(size: ChatSettings['fontSize']): string {
  switch (size) {
    case 'small':
      return '14px'
    case 'large':
      return '18px'
    default:
      return '16px'
  }
} 