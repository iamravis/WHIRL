'use client'

import { useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { fetchApi } from '@/lib/api'

interface SignUpData {
  name: string
  email: string
  password: string
}

interface UseAuthReturn {
  isLoading: boolean
  error: string | null
  signUp: (data: SignUpData) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const { data: session } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signUp = async (data: SignUpData) => {
    try {
      setIsLoading(true)
      setError(null)
      await fetchApi('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      router.push('/auth/signin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign up')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignIn = async (email: string, password: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(result.error)
      } else {
        router.push('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      setIsLoading(true)
      setError(null)
      await signOut({ redirect: false })
      router.push('/auth/signin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log out')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isLoading,
    error,
    signUp: signUp,
    signIn: handleSignIn,
    logout: handleLogout,
  }
} 