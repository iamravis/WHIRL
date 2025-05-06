'use client'

import { PlusIcon } from '@heroicons/react/24/solid'

interface NewChatButtonProps {
  onClick: () => void
}

export function NewChatButton({ onClick }: NewChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-full p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 dark:focus:ring-offset-zinc-900"
    >
      <PlusIcon className="h-6 w-6" aria-hidden="true" />
      <span className="sr-only">New Chat</span>
    </button>
  )
} 