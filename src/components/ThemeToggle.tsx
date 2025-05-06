'use client'

import { useTheme } from '@/app/ThemeProvider'
import { ViewfinderCircleIcon } from '@heroicons/react/24/outline'
import { useState, useEffect } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800 transition-colors"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <svg className="w-5 h-5 stroke-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5V3m0 18v-2M7.05 7.05 5.636 5.636m12.728 12.728L16.95 16.95M5 12H3m18 0h-2M7.05 16.95l-1.414 1.414M18.364 5.636 16.95 7.05M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/>
        </svg>
      ) : (
        <svg className="w-5 h-5 stroke-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 21a9 9 0 0 1-.5-17.986V3c-.354.966-.5 1.911-.5 3a9 9 0 0 0 9 9c.239 0 .254.018.488 0A9.004 9.004 0 0 1 12 21Z"/>
        </svg>
      )}
    </button>
  )
}

export function GridToggle() {
  const [gridEnabled, setGridEnabled] = useState(true)

  useEffect(() => {
    // Check if we've saved the grid preference in localStorage
    if (typeof window !== 'undefined') {
      const savedPreference = localStorage.getItem('gridEnabled')
      if (savedPreference !== null) {
        setGridEnabled(savedPreference === 'true')
      }
    }
    
    // Apply the grid setting based on current state
    applyGridSetting(gridEnabled)
  }, [])

  const toggleGrid = () => {
    const newState = !gridEnabled
    setGridEnabled(newState)
    
    // Save preference to localStorage
    localStorage.setItem('gridEnabled', newState.toString())
    
    // Apply the grid setting
    applyGridSetting(newState)
  }

  const applyGridSetting = (enabled: boolean) => {
    if (typeof document !== 'undefined') {
      const elements = document.querySelectorAll('.graph-paper-bg')
      elements.forEach(el => {
        if (enabled) {
          el.classList.remove('no-grid')
        } else {
          el.classList.add('no-grid')
        }
      })
    }
  }

  return (
    <button
      onClick={toggleGrid}
      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800 transition-colors"
      aria-label={`${gridEnabled ? 'Disable' : 'Enable'} background grid`}
    >
      <svg className={`w-5 h-5 stroke-2 ${!gridEnabled ? 'opacity-50' : ''}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12c0 4.9706-4.0294 9-9 9m9-9c0-4.97056-4.0294-9-9-9m9 9h-5m-4 9c-4.97056 0-9-4.0294-9-9m9 9v-5m-9-4c0-4.97056 4.02944-9 9-9m-9 9h5m4-9v5M8 3.93552V8m0 0v4m0-4H3.93552M8 8h4m-4 4v4m0-4h4m-4 4v4m0-4h4m-4 4h4m0-12.06448V8m0 0v4m0-4h4.0645M16 12v4m0 0v4.0645M16 16h4.0645"/>
      </svg>
    </button>
  )
} 