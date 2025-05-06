'use client'

import { useEffect } from 'react'
import { useUI } from './useUI'
import { useChat } from './useChat'

interface KeyboardShortcutsProps {
  onNewChat: () => void
  onToggleSidebar: () => void
  onToggleDarkMode: () => void
}

export function useKeyboardShortcuts({
  onNewChat,
  onToggleSidebar,
  onToggleDarkMode,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the user is typing in an input or textarea
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // Command/Ctrl + N: New chat
      if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault()
        onNewChat()
      }

      // Command/Ctrl + B: Toggle sidebar
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault()
        onToggleSidebar()
      }

      // Command/Ctrl + D: Toggle dark mode
      if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
        event.preventDefault()
        onToggleDarkMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNewChat, onToggleSidebar, onToggleDarkMode])
} 