'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface UseChatInputReturn {
  message: string
  textareaRef: React.RefObject<HTMLTextAreaElement>
  handleChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  resetMessage: () => void
}

export function useChatInput(onSubmit: (message: string) => void): UseChatInputReturn {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'

    // Calculate new height (with max-height of 200px)
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [message, adjustTextareaHeight])

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (message.trim()) {
        onSubmit(message.trim())
        setMessage('')
      }
    }
  }

  const resetMessage = () => {
    setMessage('')
  }

  return {
    message,
    textareaRef,
    handleChange,
    handleKeyDown,
    resetMessage,
  }
} 