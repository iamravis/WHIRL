'use client'

import { useState, useEffect } from 'react'

interface UseUIReturn {
  isDarkMode: boolean
  isSidebarOpen: boolean
  toggleDarkMode: () => void
  toggleSidebar: () => void
}

export function useUI(): UseUIReturn {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  useEffect(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark')
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDarkMode(prefersDark)
    }

    // Check for saved sidebar state
    const savedSidebarState = localStorage.getItem('sidebarOpen')
    if (savedSidebarState !== null) {
      setIsSidebarOpen(savedSidebarState === 'true')
    }
  }, [])

  useEffect(() => {
    // Update theme
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  useEffect(() => {
    // Save sidebar state
    localStorage.setItem('sidebarOpen', isSidebarOpen.toString())
  }, [isSidebarOpen])

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev)
  }

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev)
  }

  return {
    isDarkMode,
    isSidebarOpen,
    toggleDarkMode,
    toggleSidebar,
  }
} 