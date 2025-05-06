'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { format, formatDistanceToNow, isToday, isYesterday, subDays } from 'date-fns'
import { ChatBubbleLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface Chat {
  id: string
  title: string
  createdAt: string
}

interface ChatSidebarProps {
  chats: Chat[]
  currentChatId: string | null
  onChatSelect: (chatId: string) => void
  onNewChat: () => void
}

export function ChatSidebar({ chats = [], currentChatId, onChatSelect, onNewChat }: ChatSidebarProps) {
  const [hoveredChat, setHoveredChat] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const chatListRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()

  // Check if content is scrollable
  useEffect(() => {
    const checkScrollable = () => {
      if (chatListRef.current) {
        const { scrollHeight, clientHeight } = chatListRef.current
        setShowMore(scrollHeight > clientHeight)
      }
    }

    checkScrollable()
    // Add resize observer to check when container size changes
    const resizeObserver = new ResizeObserver(checkScrollable)
    if (chatListRef.current) {
      resizeObserver.observe(chatListRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [chats])

  const handleMoreClick = () => {
    if (chatListRef.current) {
      const scrollAmount = chatListRef.current.clientHeight * 0.8 // Scroll 80% of visible height
      chatListRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' })
    }
  }

  // Group chats by period (Today, Yesterday, Previous 7 Days, Older)
  const groupedChats = useMemo(() => {
    const today: Chat[] = [];
    const yesterday: Chat[] = [];
    const previous7Days: Chat[] = [];
    const older: Chat[] = [];
    
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);
    
    chats.forEach(chat => {
      const chatDate = new Date(chat.createdAt);
      if (isToday(chatDate)) {
        today.push(chat);
      } else if (isYesterday(chatDate)) {
        yesterday.push(chat);
      } else if (chatDate > sevenDaysAgo) {
        previous7Days.push(chat);
      } else {
        older.push(chat);
      }
    });
    
    return { today, yesterday, previous7Days, older };
  }, [chats]);

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        if (currentChatId === chatId) {
          onNewChat()
        }
        // Notify parent to refresh chat list
        onChatSelect('refresh')
      } else {
        console.error('Failed to delete chat:', await response.text())
      }
    } catch (error) {
      console.error('Error deleting chat:', error)
    }
  }

  if (chats.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-3">
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          No conversations yet. Start a new chat to get going!
        </p>
      </div>
    )
  }

  const renderChatGroup = (title: string, chatList: Chat[]) => {
    if (chatList.length === 0) return null;
    
    return (
      <div className="mb-4">
        <h3 className="px-3 mb-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
          {title}
        </h3>
        <div className="space-y-1">
          {chatList.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onChatSelect(chat.id)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors cursor-pointer relative ${
                currentChatId === chat.id
                  ? 'dark:bg-gray-800'
                  : 'hover:bg-transparent/10 dark:hover:bg-gray-900/50'
              }`}
              onMouseEnter={() => setHoveredChat(chat.id)}
              onMouseLeave={() => setHoveredChat(null)}
            >
              <div className="flex items-center min-w-0 flex-1 pr-2">
                <ChatBubbleLeftIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 stroke-2" />
                <div className="ml-3 flex-1 overflow-hidden">
                  <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                    {chat.title}
                  </p>
                </div>
              </div>
              {(hoveredChat === chat.id || currentChatId === chat.id) && (
                <button
                  onClick={(e) => deleteChat(chat.id, e)}
                  className="flex-shrink-0 p-1 rounded-md hover:bg-transparent/10 dark:hover:bg-gray-700 transition-colors"
                >
                  <TrashIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 stroke-2" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto py-4 flex flex-col h-full scrollbar-hide bg-[#f9f9f9]/90">
      <div className="px-3 flex-grow">
        {renderChatGroup('Today', groupedChats.today)}
        {renderChatGroup('Yesterday', groupedChats.yesterday)}
        {renderChatGroup('Previous 7 Days', groupedChats.previous7Days)}
        {renderChatGroup('Older', groupedChats.older)}
      </div>
      
      {/* Chat List Container */}
      <div ref={chatListRef} className="flex-1 overflow-y-auto px-4 scrollbar-hide">
        {renderChatGroup('Today', groupedChats.today)}
        {renderChatGroup('Yesterday', groupedChats.yesterday)}
        {renderChatGroup('Previous 7 Days', groupedChats.previous7Days)}
        {renderChatGroup('Older', groupedChats.older)}
      </div>
      
      {/* User Information Footer */}
      {(session?.user?.institution || session?.user?.role) && (
        <div className="mt-auto px-4 py-3 border-t border-gray-200 dark:border-gray-700/50">
          <div className="flex flex-col space-y-1">
            {session?.user?.institution && (
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium mr-1.5">Institution:</span>
                <span className="truncate">{session.user.institution}</span>
              </div>
            )}
            {session?.user?.role && (
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium mr-1.5">Role:</span>
                <span className="truncate">{session.user.role}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 