'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const ROLES = ['Obstetrician', 'Midwife', 'Nurse', 'GP'] as const

export default function SignUp() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const institution = formData.get('institution') as string
    const role = formData.get('role') as string

    // Validate all required fields
    if (!name || !email || !password || !institution || !role) {
      setError('All fields are required')
      setIsLoading(false)
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/api/auth/register/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: name,
          email,
          password,
          institution,
          role,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle validation errors (status 400)
        if (response.status === 400 && data) {
          // Format DRF validation errors (often nested in objects/arrays)
          let errorMessages = [];
          for (const key in data) {
            if (Array.isArray(data[key])) {
              errorMessages.push(`${key}: ${data[key].join(', ')}`);
            } else {
              errorMessages.push(`${key}: ${data[key]}`);
            }
          }
          throw new Error(errorMessages.join(' \n') || 'Validation failed');
        } else {
          // Handle other non-ok responses (e.g., 500)
          throw new Error(data.error || `Request failed with status ${response.status}`);
        }
      }

      // Redirect to signin page on success
      router.push('/auth/signin')
    } catch (error) {
      console.error('Signup error:', error)
      setError(error.message || 'Failed to create account')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen graph-paper-bg flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Image 
            src="/logo2.png" 
            alt="Logo" 
            width={140}
            height={140} 
            priority
            className="h-28 w-auto"
          />
        </div>
        <div className="text-center">
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link
              href="/auth/signin"
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
            >
              Sign in
            </Link>
          </p>
        </div>
        <div className="mt-8 bg-white dark:bg-gray-800 py-8 px-6 rounded-lg shadow">
          {error && (
            <div className="mb-4 p-2 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-sm rounded">
              {error}
            </div>
          )}
          
          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email address <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                placeholder="Min 8 characters, include numbers & letters"
              />
            </div>

            <div>
              <label htmlFor="institution" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Institution <span className="text-red-500">*</span>
              </label>
              <input
                id="institution"
                name="institution"
                type="text"
                required
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                placeholder="Enter your institution"
              />
            </div>

            <div className="relative">
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="role"
                  name="role"
                  type="text"
                  required
                  readOnly
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                  placeholder="Select your role"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                {isRoleDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg z-10">
                    {ROLES.map((roleOption) => (
                      <button
                        key={roleOption}
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('role') as HTMLInputElement
                          input.value = roleOption
                          setIsRoleDropdownOpen(false)
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        {roleOption}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                className={`w-full px-4 py-2 rounded-2xl transition-colors relative ${
                  isLoading 
                  ? 'bg-gray-500 dark:bg-gray-400 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200'
                }`}
                disabled={isLoading}
              >
                <span className={isLoading ? 'invisible' : ''}>Create account</span>
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 text-white dark:text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
} 