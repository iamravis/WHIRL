'use client'

import { useState, useEffect, useCallback } from 'react'

interface ChatMetrics {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  averageResponseTime: number
  totalChars: number
  totalWords: number
  startTime: Date
  lastMessageTime: Date
}

interface ChatAnalytics extends ChatMetrics {
  messagesPerMinute: number
  wordsPerMessage: number
  charsPerMessage: number
  sessionDuration: number
}

interface UseChatAnalyticsReturn {
  metrics: ChatAnalytics
  isTracking: boolean
  startTracking: () => void
  stopTracking: () => void
  trackMessage: (message: string, role: 'user' | 'assistant') => void
  resetMetrics: () => void
}

const initialMetrics: ChatMetrics = {
  totalMessages: 0,
  userMessages: 0,
  assistantMessages: 0,
  averageResponseTime: 0,
  totalChars: 0,
  totalWords: 0,
  startTime: new Date(),
  lastMessageTime: new Date(),
}

export function useChatAnalytics(): UseChatAnalyticsReturn {
  const [isTracking, setIsTracking] = useState(false)
  const [metrics, setMetrics] = useState<ChatMetrics>(initialMetrics)
  const [lastUserMessageTime, setLastUserMessageTime] = useState<Date | null>(null)

  useEffect(() => {
    // Load saved metrics from localStorage
    const savedMetrics = localStorage.getItem('chatMetrics')
    if (savedMetrics) {
      const parsed = JSON.parse(savedMetrics)
      setMetrics({
        ...parsed,
        startTime: new Date(parsed.startTime),
        lastMessageTime: new Date(parsed.lastMessageTime),
      })
    }
  }, [])

  useEffect(() => {
    // Save metrics to localStorage
    localStorage.setItem('chatMetrics', JSON.stringify(metrics))
  }, [metrics])

  const startTracking = useCallback(() => {
    setIsTracking(true)
    setMetrics((prev) => ({
      ...prev,
      startTime: new Date(),
    }))
  }, [])

  const stopTracking = useCallback(() => {
    setIsTracking(false)
  }, [])

  const trackMessage = useCallback(
    (message: string, role: 'user' | 'assistant') => {
      if (!isTracking) return

      const now = new Date()
      const words = message.trim().split(/\s+/).length
      const chars = message.length

      setMetrics((prev) => {
        const newMetrics = {
          ...prev,
          totalMessages: prev.totalMessages + 1,
          totalChars: prev.totalChars + chars,
          totalWords: prev.totalWords + words,
          lastMessageTime: now,
        }

        if (role === 'user') {
          setLastUserMessageTime(now)
          return {
            ...newMetrics,
            userMessages: prev.userMessages + 1,
          }
        } else {
          // Calculate response time for assistant messages
          const responseTime = lastUserMessageTime
            ? now.getTime() - lastUserMessageTime.getTime()
            : 0

          return {
            ...newMetrics,
            assistantMessages: prev.assistantMessages + 1,
            averageResponseTime:
              prev.assistantMessages === 0
                ? responseTime
                : (prev.averageResponseTime * prev.assistantMessages + responseTime) /
                  (prev.assistantMessages + 1),
          }
        }
      })
    },
    [isTracking, lastUserMessageTime]
  )

  const resetMetrics = useCallback(() => {
    setMetrics(initialMetrics)
    setLastUserMessageTime(null)
  }, [])

  // Calculate derived metrics
  const analytics: ChatAnalytics = {
    ...metrics,
    messagesPerMinute:
      metrics.totalMessages /
      ((new Date().getTime() - metrics.startTime.getTime()) / 60000),
    wordsPerMessage: metrics.totalMessages
      ? metrics.totalWords / metrics.totalMessages
      : 0,
    charsPerMessage: metrics.totalMessages
      ? metrics.totalChars / metrics.totalMessages
      : 0,
    sessionDuration: (new Date().getTime() - metrics.startTime.getTime()) / 1000,
  }

  return {
    metrics: analytics,
    isTracking,
    startTracking,
    stopTracking,
    trackMessage,
    resetMetrics,
  }
} 