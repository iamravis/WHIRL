'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeftIcon, CameraIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export default function Settings() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    institution: '',
    role: '',
  })

  // Update form data when session is loaded
  useEffect(() => {
    if (session?.user) {
      setFormData(prevData => ({
        ...prevData,
        name: session.user.name || '',
        email: session.user.email || '',
        institution: session.user.institution || '',
        role: session.user.role || '',
      }))
    }
  }, [session])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return
    
    const file = e.target.files[0]
    const formData = new FormData()
    formData.append('image', file)
    
    setIsLoading(true)
    setError('')
    setSuccess('')
    
    try {
      const response = await fetch('/api/user/upload-image', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to upload image')
      }
      
      const data = await response.json()
      console.log('Upload successful, new image URL:', data.imageUrl)
      
      // Update session with new image URL
      await update({ 
        ...session, 
        user: { 
          ...session?.user, 
          image: data.imageUrl 
        } 
      })
      
      setSuccess('Profile image updated successfully')
      
      // Force reload after a short delay to show the success message
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')
    
    try {
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          institution: formData.institution,
          role: formData.role,
        }),
      })
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }
      
      // Update session with new data
      await update({ 
        ...session, 
        user: { 
          ...session?.user, 
          name: formData.name, 
          email: formData.email,
          institution: formData.institution,
          role: formData.role
        } 
      });
      
      setSuccess('Profile updated successfully')
    } catch (err) {
      console.error('Profile update error:', err);
      setError(err instanceof Error ? err.message : 'Failed to update profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match')
      return
    }
    
    setIsLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/user/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      })
      
      if (!response.ok) throw new Error('Failed to update password')
      
      setSuccess('Password updated successfully')
      setFormData({ ...formData, currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setError('Failed to update password. Please check your current password.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!session?.user?.email) return
    
    setIsDeleting(true)
    setError('')
    
    try {
      const response = await fetch('/api/user/delete-account', {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete account')
      }
      
      // Sign out and redirect to login page
      signOut({ callbackUrl: '/auth/signin' })
    } catch (err) {
      console.error('Delete account error:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete account. Please try again.')
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="min-h-screen graph-paper-bg">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center mb-8">
          <button
            onClick={() => router.back()}
            className="mr-4 p-2 rounded-full hover:bg-white/60 dark:hover:bg-zinc-800/70 backdrop-blur-sm"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 stroke-2" />
          </button>
          <h1 className="text-2xl font-bold text-gray-600 dark:text-gray-300">Settings</h1>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50/80 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full backdrop-blur-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50/80 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full backdrop-blur-sm">
            {success}
          </div>
        )}

        {/* Profile Section */}
        <div className="auth-card mb-8">
          <h2 className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-6">Profile</h2>
          
          {/* Profile Image */}
          <div className="flex items-center mb-8">
            <div className="relative">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'Profile'}
                  width={80}
                  height={80}
                  className="rounded-full"
                  unoptimized={true}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <span className="text-2xl font-medium text-gray-600 dark:text-gray-300">
                    {session?.user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-white/80 dark:bg-zinc-700/90 rounded-full shadow-md border border-white/20 dark:border-gray-700/30 hover:bg-white/90 dark:hover:bg-zinc-600/90 transition-colors backdrop-blur-sm"
              >
                <CameraIcon className="h-4 w-4 text-gray-500 dark:text-gray-400 stroke-2" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleProfileUpdate} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <div>
              <label htmlFor="institution" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Institution
              </label>
              <input
                type="text"
                id="institution"
                name="institution"
                value={formData.institution}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Role
              </label>
              <input
                type="text"
                id="role"
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              {isLoading ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>

        {/* Password Section */}
        <div className="auth-card mb-8">
          <h2 className="text-lg font-medium text-gray-700 dark:text-gray-200 mb-6">Password</h2>
          <form onSubmit={handlePasswordUpdate} className="space-y-5">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                id="currentPassword"
                name="currentPassword"
                value={formData.currentPassword}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/60 dark:bg-[#383838]/60 backdrop-blur-sm rounded-2xl border border-black/10 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Delete Account Section */}
        <div className="auth-card border-red-200/30 dark:border-red-900/30">
          <h2 className="text-lg font-medium text-red-600 dark:text-red-400 mb-4 flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2 stroke-2" />
            Delete Your Account
          </h2>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Deleting your account will permanently remove all your data, including chat history and profile information. This action cannot be undone.
          </p>
          
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-full text-sm font-medium transition-colors"
            >
              Delete Account
            </button>
          ) : (
            <div className="bg-red-50/80 dark:bg-red-900/20 p-4 rounded-xl mb-4">
              <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">
                Are you sure you want to delete your account? This action cannot be undone.
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-6 py-2 rounded-full text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 