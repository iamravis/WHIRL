'use client'

import { useState, useEffect, useCallback } from 'react'

interface NotificationOptions {
  title: string
  body: string
  icon?: string
  tag?: string
  requireInteraction?: boolean
}

interface UseChatNotificationsReturn {
  isEnabled: boolean
  isPending: boolean
  error: string | null
  enableNotifications: () => Promise<void>
  disableNotifications: () => void
  showNotification: (options: NotificationOptions) => void
}

export function useChatNotifications(): UseChatNotificationsReturn {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      setError('Notifications are not supported in this browser')
      return
    }

    // Check if notifications are already enabled
    if (Notification.permission === 'granted') {
      setIsEnabled(true)
    }
  }, [])

  const enableNotifications = useCallback(async () => {
    try {
      setIsPending(true)
      setError(null)

      if (!('Notification' in window)) {
        throw new Error('Notifications are not supported in this browser')
      }

      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setIsEnabled(true)
      } else {
        throw new Error('Permission to show notifications was denied')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable notifications')
      setIsEnabled(false)
    } finally {
      setIsPending(false)
    }
  }, [])

  const disableNotifications = useCallback(() => {
    setIsEnabled(false)
  }, [])

  const showNotification = useCallback(
    (options: NotificationOptions) => {
      if (!isEnabled) return

      try {
        const notification = new Notification(options.title, {
          body: options.body,
          icon: options.icon,
          tag: options.tag,
          requireInteraction: options.requireInteraction,
        })

        notification.onclick = () => {
          window.focus()
          notification.close()
        }
      } catch (err) {
        console.error('Failed to show notification:', err)
      }
    },
    [isEnabled]
  )

  return {
    isEnabled,
    isPending,
    error,
    enableNotifications,
    disableNotifications,
    showNotification,
  }
} 