'use client'

import { useState } from 'react'
// import { signIn } from 'next-auth/react' // No longer using next-auth signIn
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { setCookie } from 'cookies-next'

export default function SignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('') // Changed back to email
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    // Using state variables
    // Basic validation (can be enhanced)
    if (!email || !password) {
        setError('Please enter both email and password')
        setIsLoading(false)
        return
    }
     // Validate email format (optional but good practice)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      setIsLoading(false)
      return
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000' // Ensure this points to your Django backend
    console.log(`Attempting to log in with email: ${email} to API URL: ${apiUrl}/api/auth/login/`);

    try {
        // Call the Django JWT endpoint directly
        const response = await fetch(`${apiUrl}/api/auth/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            // Send email and password (backend needs adjustment)
            body: JSON.stringify({ email, password }),
        });

        console.log(`Login response status: ${response.status}`);
        
        // Try to get the response text first to see if it's valid JSON
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        // Then parse as JSON if possible
        let data;
        try {
            data = JSON.parse(responseText);
            console.log('Parsed response data:', data);
        } catch (e) {
            console.error('Failed to parse response as JSON:', e);
            setError(`Server returned invalid JSON: ${responseText}`);
            setIsLoading(false);
            return;
        }

        if (response.ok) {
            console.log('Login successful, setting cookies');
            
            try {
                // Store tokens in cookies instead of localStorage
                if (data && data.access) {
                    console.log('Setting access token cookie');
                    setCookie('access_token', data.access, {
                      maxAge: 60 * 60 * 24, // 1 day
                      path: '/'
                    });
                } else {
                    console.error("Error: data.access not found in response!");
                    setError("Login succeeded but received invalid token data (access).");
                    setIsLoading(false);
                    return; // Stop execution if token is missing
                }

                if (data && data.refresh) {
                    console.log('Setting refresh token cookie');
                    setCookie('refresh_token', data.refresh, {
                      maxAge: 60 * 60 * 24 * 7, // 7 days
                      path: '/'
                    });
                } else {
                    console.error("Error: data.refresh not found in response!");
                    setError("Login succeeded but received invalid token data (refresh).");
                    setIsLoading(false);
                    return; // Stop execution if token is missing
                }
                
                // Check that cookies were actually set
                setTimeout(() => {
                    const cookies = document.cookie;
                    console.log('Current cookies after login:', cookies);
                }, 100);
            } catch (storageError) {
                console.error("Error storing cookies:", storageError);
                setError("Failed to store authentication tokens. Please check browser settings.");
                setIsLoading(false);
                return; // Stop execution if storage fails
            }

            console.log('Redirecting to home page');
            // TODO: Update global auth state if using Context/Redux/Zustand
            router.push('/')

        } else {
            // Handle login errors from the backend
            console.error('Login failed:', data);
            let errorMsg = `Login failed (Status: ${response.status}).`;
            if (data && data.detail) {
                errorMsg += ` Details: ${data.detail}`; // Common error format for simplejwt
            } else if (data && typeof data === 'object') {
                const errors = Object.entries(data).map(([field, messages]) =>
                    `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`
                ).join('; ');
                errorMsg += ` Details: ${errors}`;
            }
            setError(errorMsg);
        }
    } catch (error) {
        // Check if the error is due to JSON parsing
        if (error instanceof SyntaxError) {
            setError('Failed to parse server response. Please check backend.');
            // Optionally try to log the raw text response
            // response.text().then(text => console.error("Raw response text:", text));
        } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
           setError('Network error: Could not connect to the server. Is it running?');
        } else {
           setError('An unexpected error occurred during login.');
        }
    } finally {
        setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen graph-paper-bg flex flex-col items-center justify-center -mt-16 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm py-8 px-6 rounded-lg shadow-lg">
          <div className="flex justify-center mb-6">
            <Image 
              src="/logo2.png" 
              alt="Logo" 
              width={140}
              height={140} 
              priority
              className="h-28 w-auto"
            />
          </div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Or{' '}
              <Link
                href="/auth/signup"
                className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
              >
                create a new account
              </Link>
            </p>
          </div>
          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-2 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 text-sm rounded">
              {error}
            </div>
          )}
          
          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              {/* Changed back to email */}
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                placeholder="name@example.com"
                value={email} // Bind value to state
                onChange={(e) => setEmail(e.target.value)} // Update state on change
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                placeholder="Password"
                value={password} // Bind value to state
                onChange={(e) => setPassword(e.target.value)} // Update state on change
              />
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
                <span className={isLoading ? 'invisible' : ''}>Sign in</span>
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
