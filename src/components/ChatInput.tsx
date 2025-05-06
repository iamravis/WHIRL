'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, PhotoIcon, DocumentIcon } from '@heroicons/react/24/outline'
import { useTheme } from 'next-themes'
import { VerticalBarsLoading } from './Loading'

interface ChatInputProps {
  onSendMessage: (message: string, useApi?: boolean, apiProvider?: string) => void
  isLoading?: boolean
  onStopGeneration?: () => void
}

interface AttachedFile {
  name: string
  type: 'image' | 'file'
  size: number
}

// Define an interface for the search result structure
interface SearchResult {
  title: string;
  snippet: string;
  // Add other fields if necessary (e.g., url, id)
}

export function ChatInput({ onSendMessage, isLoading = false, onStopGeneration }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [showAttachOptions, setShowAttachOptions] = useState(false)
  const [showApiOptions, setShowApiOptions] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [useApi, setUseApi] = useState(() => {
    // Check if we've saved the API mode preference in localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('useApi') === 'true';
    }
    return false;
  })
  const [apiProvider, setApiProvider] = useState(() => {
    // Check if we've saved the API provider preference in localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('apiProvider') || 'nebius';
    }
    return 'nebius';
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const apiMenuRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { theme } = useTheme();

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      const textarea = textareaRef.current
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'
      // Get the scroll height and set the new height
      const scrollHeight = textarea.scrollHeight
      const newHeight = Math.min(scrollHeight, 200)
      textarea.style.height = `${newHeight}px`
      
      // Update expanded state based on content height
      setIsExpanded(scrollHeight > 44)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !isLoading) {
      // Pass useApi flag and apiProvider to the parent component
      onSendMessage(message.trim(), useApi, apiProvider)
      setMessage('')
      setIsExpanded(false)
      if (textareaRef.current) {
        textareaRef.current.style.height = '24px'
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    adjustTextareaHeight()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleImageAttach = () => {
    imageInputRef.current?.click()
    setShowAttachOptions(false)
  }

  const handleFilesAttach = () => {
    fileInputRef.current?.click()
    setShowAttachOptions(false)
  }

  const handleDriveAttach = () => {
    // Handle drive attachment
    setShowAttachOptions(false)
    console.log('Attach from drive')
  }

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAttachedFiles(prev => [...prev, {
        name: file.name,
        type: 'image',
        size: file.size
      }]);
      e.target.value = '';
    }
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setAttachedFiles(prev => [...prev, {
        name: file.name,
        type: 'file',
        size: file.size
      }]);
      e.target.value = '';
    }
  }

  const removeAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(1) + ' KB';
    const mb = kb / 1024;
    return mb.toFixed(1) + ' MB';
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachOptions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Adjust height whenever message changes
  useEffect(() => {
    adjustTextareaHeight()
  }, [message])

  // Toggle API mode
  const toggleApiMode = () => {
    setShowApiOptions(!showApiOptions);
  };

  // Select API provider and enable API mode
  const selectApiProvider = (provider: string) => {
    setApiProvider(provider);
    setUseApi(true);
    setShowApiOptions(false);
    // Save preferences to localStorage
    localStorage.setItem('apiProvider', provider);
    localStorage.setItem('useApi', 'true');
  };

  // Turn off API mode
  const disableApi = () => {
    setUseApi(false);
    setShowApiOptions(false);
    localStorage.setItem('useApi', 'false');
  };

  // Close API dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (apiMenuRef.current && !apiMenuRef.current.contains(event.target as Node)) {
        setShowApiOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle stop generation
  const handleStopGeneration = () => {
    if (onStopGeneration) {
      onStopGeneration();
    }
  };

  // Format elapsed time as minutes:seconds
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Set up a timer to track elapsed time during loading
  useEffect(() => {
    if (isLoading) {
      // Reset timer when loading starts
      setElapsedTime(0);
      
      // Set up interval to update elapsed time every second
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      // Clear the timer when loading stops
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    
    // Clean up on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isLoading]);

  // New function to handle microphone click
  const handleMicrophoneClick = () => {
    // Implementation for microphone functionality would go here
    console.log('Microphone clicked');
    // For now, we'll just focus the textarea
    textareaRef.current?.focus();
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full">
      <div className="w-full max-w-3xl relative flex flex-col py-2 md:py-3">
        {/* Attached Files Display */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-4">
            {attachedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm"
              >
                {file.type === 'image' ? (
                  <PhotoIcon className="h-4 w-4 text-gray-500 stroke-2" />
                ) : (
                  <DocumentIcon className="h-4 w-4 text-gray-500 stroke-2" />
                )}
                <span className="text-gray-700 dark:text-gray-300 max-w-[150px] truncate">
                  {file.name}
                </span>
                <span className="text-gray-500 text-xs">
                  ({formatFileSize(file.size)})
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="ml-1 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                >
                  <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="relative w-full">
          <div className={`relative w-full rounded-3xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 transition-all backdrop-blur-sm shadow-md hover:shadow-lg transform transition-transform duration-150 hover:-translate-y-0.5`}>
            {/* Search Results */}
            {isSearchActive && searchResults.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-zinc-800 rounded-xl shadow-lg max-h-60 overflow-auto border border-gray-200 dark:border-gray-700 dark:shadow-gray-800/40">
                <div className="p-2">
                  <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1">Search Results</h3>
                  {searchResults.map((result, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => console.log('Search result clicked:', result)}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm transition-colors"
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100">{result.title}</div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs truncate">{result.snippet}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Textarea Container - Increased bottom padding */}
            <div className="max-h-[200px] overflow-y-auto px-5 pt-3 pb-14">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask WHI²RL"
                className="w-full h-full resize-none bg-transparent border-0 focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-base outline-none"
                style={{ 
                  lineHeight: '1.5',
                  maxHeight: '200px'
                }}
              />
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 flex items-center px-4 py-3">
              <div className="flex items-center gap-4">
                <div className="relative" ref={attachMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowAttachOptions(!showAttachOptions)}
                    className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors border ${
                      showAttachOptions
                        ? 'bg-gray-900 dark:bg-gray-800 border-gray-900 dark:border-gray-700'
                        : 'bg-gray-900 dark:bg-gray-800 border-gray-900 dark:border-gray-700'
                    }`}
                  >
                    <svg className="h-5 w-5 text-white dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9V4a1 1 0 0 0-1-1H8.914a1 1 0 0 0-.707.293L4.293 7.207A1 1 0 0 0 4 7.914V20a1 1 0 0 0 1 1h4M9 3v4a1 1 0 0 1-1 1H4m11 6v4m-2-2h4m3 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"/>
                    </svg>
                  </button>
                  
                  {/* Hidden file inputs */}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileSelected}
                    accept="image/*,.pdf,.doc,.docx,.txt" 
                    className="hidden"
                    multiple
                  />
                  <input 
                    type="file" 
                    ref={imageInputRef}
                    onChange={handleImageSelected}
                    accept="image/*" 
                    className="hidden"
                    multiple
                  />
                  
                  {/* Attachment options dropdown */}
                  {showAttachOptions && (
                    <div className="absolute left-0 bottom-full mb-2 z-10 w-36 rounded-lg shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 overflow-hidden">
                      <button
                        type="button"
                        onClick={handleImageAttach}
                        className="flex items-center w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <PhotoIcon className="h-5 w-5 mr-2 stroke-2" />
                        Image
                      </button>
                      <button
                        type="button"
                        onClick={handleFilesAttach}
                        className="flex items-center w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <DocumentIcon className="h-5 w-5 mr-2 stroke-2" />
                        Files
                      </button>
                      <button
                        type="button"
                        onClick={handleDriveAttach}
                        className="flex items-center w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        </svg>
                        Drive
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsSearchActive(!isSearchActive)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors border ${
                    isSearchActive
                      ? 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                  Web Search
                </button>

                <div className="relative" ref={apiMenuRef}>
                  <button
                    type="button"
                    onClick={toggleApiMode}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-colors border ${
                      useApi
                        ? 'border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    {useApi ? (apiProvider === 'openai' ? 'OpenAI' : 'Nebius') : 'Use API'}
                  </button>
                  
                  {showApiOptions && (
                    <div className="absolute left-0 bottom-full mb-2 z-10 w-40 rounded-xl shadow-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => selectApiProvider('nebius')}
                        className={`flex items-center w-full px-3.5 py-2.5 text-xs text-left ${
                          useApi && apiProvider === 'nebius'
                            ? 'text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-900/20'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50/70 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="flex items-center justify-center w-5 h-5 mr-2.5">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Z"/>
                            <path d="M20 16V9a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7"/>
                            <path d="M12 10v4"/>
                            <path d="M12 18v.01"/>
                            <path d="M2 16h20"/>
                            <path d="M4 22h16a2 2 0 0 0 2-2v-4H2v4a2 2 0 0 0 2 2Z"/>
                          </svg>
                        </div>
                        Nebius
                      </button>
                      <button
                        type="button"
                        onClick={() => selectApiProvider('openai')}
                        className={`flex items-center w-full px-3.5 py-2.5 text-xs text-left ${
                          useApi && apiProvider === 'openai'
                            ? 'text-green-700 dark:text-green-300 bg-green-50/70 dark:bg-green-900/20'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50/70 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="flex items-center justify-center w-5 h-5 mr-2.5">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                            <path d="M3 5c0 1.66 4 3 9 3s9-1.34 9-3"/>
                            <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
                          </svg>
                        </div>
                        OpenAI
                      </button>
                      <button
                        type="button"
                        onClick={() => disableApi()}
                        className={`flex items-center w-full px-3.5 py-2.5 text-xs text-left border-t border-gray-200 dark:border-gray-700/50 ${
                          !useApi
                            ? 'text-gray-900 dark:text-gray-100 bg-gray-100/70 dark:bg-gray-700/30'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50/70 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="flex items-center justify-center w-5 h-5 mr-2.5">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6 6 18"/>
                            <path d="m6 6 12 12"/>
                          </svg>
                        </div>
                        No API
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 ml-auto">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-900 dark:bg-gray-800 border border-gray-900 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                  >
                    {/* Custom Stop Icon */}
                    <svg 
                      className="h-5 w-5 text-white dark:text-white" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect 
                        x="6" 
                        y="6" 
                        width="12" 
                        height="12" 
                        rx="2" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                ) : message.trim() === '' ? (
                  <button
                    type="button"
                    onClick={handleMicrophoneClick}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-900 dark:bg-gray-800 border border-gray-900 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                  >
                    {/* Custom Microphone Icon */}
                    <svg
                      className="h-5 w-5 text-white dark:text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 15.5C14.21 15.5 16 13.71 16 11.5V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V11.5C8 13.71 9.79 15.5 12 15.5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4.35 9.64999V11.35C4.35 15.57 7.78 19 12 19C16.22 19 19.65 15.57 19.65 11.35V9.64999"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 19V22"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={message.trim() === ''}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-900 dark:bg-gray-800 border border-gray-900 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                  >
                    {/* Custom Send Icon */}
                    <svg
                      className="h-5 w-5 text-white dark:text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M21 12L3 4L5 12L3 20L21 12Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                      <path
                        d="M5 12H14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
      <div className="px-2 pt-2 pb-1 text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
        WHI²RL can make mistakes. Consider checking important information.
      </div>
    </div>
  )
} 