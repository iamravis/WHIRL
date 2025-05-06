'use client'

import { useEffect, useRef, useState } from 'react'

interface UseScrollToBottomReturn {
  containerRef: React.RefObject<HTMLDivElement>
  isAtBottom: boolean
  scrollToBottom: () => void
}

export function useScrollToBottom(): UseScrollToBottomReturn {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const scrollToBottom = () => {
    if (containerRef.current) {
      const { scrollHeight, clientHeight } = containerRef.current
      containerRef.current.scrollTop = scrollHeight - clientHeight
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setIsAtBottom(distanceFromBottom < 100)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom()
    }
  }, [isAtBottom])

  return {
    containerRef,
    isAtBottom,
    scrollToBottom,
  }
} 