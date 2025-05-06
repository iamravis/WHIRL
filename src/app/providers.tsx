'use client'

import { ThemeProvider } from './ThemeProvider'
import React from 'react'

interface ProvidersProps {
  children: React.ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>{children}</ThemeProvider>
  )
} 