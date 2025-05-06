'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChatSidebar } from '@/components/ChatSidebar'
import { ChatMessages, ThinkingDisplay } from '@/components/ChatMessages'
import { ChatInput } from '@/components/ChatInput'
import { Loading } from '@/components/Loading'
import { Bars3Icon, ChevronDownIcon, PlusIcon, MagnifyingGlassIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Cog6ToothIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import Image from 'next/image'
import { ThemeToggle, GridToggle } from '@/components/ThemeToggle'
import { fetchWithAuth } from '@/lib/api' // Import fetchWithAuth
import { deleteCookie } from 'cookies-next';
import { getCookie } from 'cookies-next';
import { EventSourcePolyfill } from 'event-source-polyfill';

interface Chat {
  id: string
  title: string
  createdAt: string
  messages: Array<{
    id: string
    content: string
    role: 'user' | 'assistant'
    createdAt: string
  }>
}

// Define userInfo type including optional image
interface UserInfo {
    name: string;
    email: string;
    institution: string | null;
    role: string | null;
    image?: string | null; // Add optional image property
}

// Define Message type if not already defined globally or imported
interface Message {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    createdAt: string;
}

// Define a custom event type for the SSE events
interface CustomMessageEvent {
  data: string;
}

export default function Home() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [hasFetchedChats, setHasFetchedChats] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [chatToDelete, setChatToDelete] = useState<string | null>(null)
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('skipDeleteConfirm') === 'true'
  })
  const [showMore, setShowMore] = useState(false)
  const [modelType, setModelType] = useState(() => {
    if (typeof window === 'undefined') return 'base';
    return localStorage.getItem('modelType') || 'base';
  })
  const [showModelOptions, setShowModelOptions] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const chatListRef = useRef<HTMLDivElement>(null)
  const [serverGeneratedChatIds, setServerGeneratedChatIds] = useState<Record<string, string>>({})
  const [thinkingContent, setThinkingContent] = useState<string | null>(null)
  const [isThinkingComplete, setIsThinkingComplete] = useState(false)
  const [systemMessage, setSystemMessage] = useState<string>("")
  const [selectedModel, setSelectedModel] = useState<string>("base")
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [authStatus, setAuthStatus] = useState<'authenticated' | 'unauthenticated' | 'loading'>('loading')
  const [error, setError] = useState<string | null>(null); // <<< ADD ERROR STATE
  const profileDropdownRef = useRef<HTMLDivElement>(null)
  const [isLogoHovered, setIsLogoHovered] = useState(false); // Add state for logo hover
  const eventSourceRef = useRef<EventSource | null>(null); // Ref to hold the EventSource instance

  // Moved fetchUserProfile outside useEffect to make it accessible
  const fetchUserProfile = async (token: string): Promise<boolean> => {
      console.log("Fetching user profile with token (reusable)..."); 
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const profileUrl = `${apiUrl}/api/profile/me/`;
      
      try {
          // Use fetchWithAuth instead of standard fetch
          const response = await fetchWithAuth(profileUrl, { 
              headers: {
                  // fetchWithAuth adds the token, but explicit check here is ok
                  // If fetchWithAuth requires the token to be passed differently,
                  // adjust accordingly. Assuming it reads from localStorage or handles it.
                  'Authorization': `Bearer ${token}`, 
                  'Accept': 'application/json',
              }
          });

          if (response.ok) {
              const userData = await response.json();
              const newUserInfo: UserInfo = {
                  name: `${userData.first_name} ${userData.last_name}`.trim(),
                  email: userData.email,
                  institution: userData.profile?.institution,
                  role: userData.profile?.role,
                  image: userData.profile?.image,
              };
              setUserInfo(newUserInfo);
              if (authStatus !== 'authenticated') { 
                 setAuthStatus('authenticated');
              }
              return true; // Indicate success
          } else if (response.status === 401) {
              console.error("Profile fetch failed (401): Token invalid or expired? Attempting logout.");
              // Don't logout here, let handleSendMessage decide based on return value
              return false; // Indicate failure (likely needs logout)
          } else {
               console.error(`Profile fetch failed (${response.status}): Cannot display profile.`);
               return false; // Indicate failure
          }
      } catch (error) {
           console.error("Error during fetchUserProfile network request:", error);
           return false; // Indicate failure
      }
  }; 

  // Helper function to log important events with timestamp
  const debugEvent = (eventName: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] EVENT: ${eventName}`);
    if (data) {
      console.log(`[${timestamp}] DATA:`, data);
    }
  };

  // Create a helper for loading and saving chats with proper typing
  const persistenceHelper = {
    // Cast to the proper role types
    castRolesToLiterals: (messages: any[]) => {
      if (!Array.isArray(messages)) return [];
      
      // Create a new array with properly typed messages
      return messages.map(msg => {
        // Handle potentially undefined messages
        if (!msg) {
          return {
            id: Date.now().toString(),
            content: '',
            role: 'user' as const,
            createdAt: new Date().toISOString()
          };
        }
        
        // Ensure role is a string for comparison
        const roleStr = String(msg.role || '').toLowerCase();
        
        // Determine if this is an assistant message
        const isAssistant = roleStr.includes('assist');
        
        // Create a properly typed message
        return {
          id: String(msg.id || Date.now()),
          content: String(msg.content || ''),
          role: isAssistant ? 'assistant' as const : 'user' as const,
          createdAt: String(msg.createdAt || new Date().toISOString())
        };
      });
    },
    
    // Load current chat with proper typing
    loadCurrentChat: () => {
      try {
        const currentChat = localStorage.getItem('currentChat');
        if (!currentChat) return null;
        
        const parsed = JSON.parse(currentChat);
        if (!parsed || !parsed.messages || !Array.isArray(parsed.messages)) return null;
        
        return {
          messages: persistenceHelper.castRolesToLiterals(parsed.messages),
          chatId: parsed.chatId
        };
      } catch (e) {
        console.error('Error loading current chat:', e);
        return null;
      }
    },
    
    // Save current chat with proper typing
    saveCurrentChat: (messages: any[], chatId: string) => {
      try {
        const typedMessages = persistenceHelper.castRolesToLiterals(messages);
        localStorage.setItem('currentChat', JSON.stringify({
          messages: typedMessages,
          chatId
        }));
        return typedMessages;
      } catch (e) {
        console.error('Error saving current chat:', e);
        return messages;
      }
    },
    
    // Load a specific chat from localStorage
    loadChat: (chatId: string) => {
      try {
        const chat = localStorage.getItem(`chat_${chatId}`);
        if (!chat) return null;
        
        const parsed = JSON.parse(chat);
        if (!parsed || !parsed.messages || !Array.isArray(parsed.messages)) return null;
        
        return {
          ...parsed,
          messages: persistenceHelper.castRolesToLiterals(parsed.messages)
        };
      } catch (e) {
        console.error(`Error loading chat ${chatId}:`, e);
        return null;
      }
    },
    
    // Save a chat to localStorage
    saveChat: (chat: Chat) => {
      try {
        const typedChat = {
          ...chat,
          messages: persistenceHelper.castRolesToLiterals(chat.messages)
        };
        localStorage.setItem(`chat_${chat.id}`, JSON.stringify(typedChat));
        return typedChat;
      } catch (e) {
        console.error(`Error saving chat ${chat.id}:`, e);
        return chat;
      }
    },
    
    // Load all chats from localStorage
    loadAllChats: () => {
      const allChats: Chat[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('chat_')) {
          const chatId = key.replace('chat_', '');
          const loadedChat = persistenceHelper.loadChat(chatId);
          if (loadedChat) {
            allChats.push(loadedChat as Chat);
          }
        }
      }
      return allChats;
    }
  };

  // Load chats from localStorage on initial load
  useEffect(() => {
    try {
      const savedChats = persistenceHelper.loadAllChats();
      if (savedChats && savedChats.length > 0) {
        setChats(savedChats);
      }
      
      // Try to load server ID mappings
      const savedMappings = localStorage.getItem('server_chat_id_mappings');
      if (savedMappings) {
        try {
          const mappings = JSON.parse(savedMappings);
          setServerGeneratedChatIds(mappings);
          debugEvent('LOADED_SERVER_ID_MAPPINGS', { count: Object.keys(mappings).length });
        } catch (e) {
          console.error('Failed to parse server ID mappings', e);
        }
      }
    } catch (e) {
      console.error('Failed to load chats from localStorage', e);
    }
  }, []);
  
  // Save server ID mappings when they change
  useEffect(() => {
    if (Object.keys(serverGeneratedChatIds).length > 0) {
      localStorage.setItem('server_chat_id_mappings', JSON.stringify(serverGeneratedChatIds));
      debugEvent('SAVED_SERVER_ID_MAPPINGS', { mappings: serverGeneratedChatIds });
    }
  }, [serverGeneratedChatIds]);

  // Load messages and chat state from localStorage when component mounts
  useEffect(() => {
    const loadSavedChats = () => {
      try {
        debugEvent('LOAD_SAVED_CHATS_START', { refreshCount: sessionStorage.getItem('refreshCount') || '0' });
        
        // Track refresh count to help debug the issue
        const refreshCount = parseInt(sessionStorage.getItem('refreshCount') || '0', 10);
        sessionStorage.setItem('refreshCount', (refreshCount + 1).toString());
        
        // Add debugging to check localStorage contents
        console.log('====================== DEBUG ======================');
        console.log('LOCALSTORAGE CONTENT CHECK:');
        const lsKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            lsKeys.push(key);
            if (key === 'currentChat' || key.startsWith('chat_')) {
              try {
                const rawData = localStorage.getItem(key);
                console.log(`LocalStorage key: ${key}, raw data:`, rawData);
                const parsed = JSON.parse(rawData || '{}');
                if (parsed.messages && Array.isArray(parsed.messages)) {
                  console.log(`Message count: ${parsed.messages.length}`);
                  console.log(`Messages with roles:`, parsed.messages.map(m => ({ role: m.role, content: m.content.substring(0, 20) + '...'})));
                  
                  // Fix any malformed roles directly in localStorage
                  const fixed = parsed.messages.map(msg => ({
                    ...msg,
                    // Ensure role is never undefined/null and properly set
                    role: (msg.role && msg.role.toString().toLowerCase().includes('assist')) ? 'assistant' : 'user'
                  }));
                  
                  // Re-save with fixed roles
                  localStorage.setItem(key, JSON.stringify({
                    ...parsed,
                    messages: fixed
                  }));
                }
              } catch (e) {
                console.log(`Error parsing ${key}:`, e);
              }
            }
          }
        }
        console.log('LocalStorage keys:', lsKeys);
        console.log('=================================================');

        // Load current chat first and ensure roles are properly set
        const currentChat = persistenceHelper.loadCurrentChat();
        if (currentChat && currentChat.messages.length > 0) {
          debugEvent('CURRENT_CHAT_LOADED', { 
            messageCount: currentChat.messages.length,
            roles: currentChat.messages.map(m => m.role)
          });
          
          // Force type assertion to avoid TypeScript errors
          setMessages(currentChat.messages as Message[]);
          setCurrentChatId(currentChat.chatId);
          
          // Re-save to ensure consistent format for next refresh
          persistenceHelper.saveCurrentChat(currentChat.messages, currentChat.chatId);
        }

        // Load all saved chats
        const allChats: Chat[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('chat_')) {
            const chatId = key.replace('chat_', '');
            const loadedChat = persistenceHelper.loadChat(chatId);
            if (loadedChat) {
              allChats.push(loadedChat as Chat);
              
              // Re-save to ensure consistent format for next refresh
              persistenceHelper.saveChat(loadedChat as Chat);
            }
          }
        }

        if (allChats.length > 0) {
          const sortedChats = allChats.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setChats(sortedChats as Chat[]);
        }
        
        debugEvent('LOAD_SAVED_CHATS_COMPLETE');
      } catch (error) {
        console.error('Error loading saved chats:', error);
      }
    };

    loadSavedChats();
  }, []);

  // Save current chat state whenever messages or currentChatId changes
  useEffect(() => {
    if (messages.length > 0 && currentChatId) {
      // Use the persistence helper to save
      persistenceHelper.saveCurrentChat(messages, currentChatId);

      // Create and save the chat
      const updatedChat: Chat = {
        id: currentChatId,
        title: (messages[0]?.content || '').substring(0, 30) + '...',
        createdAt: messages[0]?.createdAt || new Date().toISOString(),
        messages: persistenceHelper.castRolesToLiterals(messages)
      };

      persistenceHelper.saveChat(updatedChat);
      
      // Update chat in the list if it exists
      setChats(prev => {
        const exists = prev.some(chat => chat.id === currentChatId);
        if (exists) {
          return prev.map(chat => 
            chat.id === currentChatId ? updatedChat : chat
          ) as Chat[];
        }
        return [updatedChat, ...prev] as Chat[];
      });
    }
  }, [messages, currentChatId]);

  // Fetch chats with deduplication
  const fetchChats = async () => {
    if (!userInfo || isLoading) return

    try {
      setIsLoading(true)
      // Use our syncChats function which merges local and server chats
      await syncChats();
    } catch (error) {
      console.error('Error fetching chats:', error)
    } finally {
      setIsLoading(false)
      setHasFetchedChats(true)
    }
  }

  // Fetch chats when needed
  useEffect(() => {
    if (authStatus==='authenticated' && !hasFetchedChats) {
      fetchChats()
    }
  }, [authStatus, hasFetchedChats])

  // Sync local and server chats (using manual token/userInfo)
  const syncChats = async () => {
    const token = getCookie('access_token');
    if (!token) {
      console.error("No token found for syncing chats. Logging out.");
      handleLogout();
      return;
    }
    
    try {
      debugEvent('SYNC_CHATS_START');
      setIsLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      
      // Use fetchWithAuth instead of regular fetch
      const response = await fetchWithAuth(`${apiUrl}/api/chats/`); 
      
      if (!response.ok) { 
          if (response.status === 401) { handleLogout(); }
          throw new Error(`Failed to fetch chats from server: ${response.status}`);
      }
      const serverChats = await response.json();
      if (!Array.isArray(serverChats)) { throw new Error('Invalid response format from server'); }
      
      const serverChatsMap = new Map(serverChats.map((chat: Chat) => [chat.id, chat])); 
      const localChats = persistenceHelper.loadAllChats();
      // Correctly convert Map values to Array
      const mergedChats: Chat[] = Array.from(serverChatsMap.values()); 
      localChats.forEach(localChat => { if (!serverChatsMap.has(localChat.id)) { mergedChats.push(localChat); } });
      const sortedChats = mergedChats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setChats(sortedChats);
      setHasFetchedChats(true);
      debugEvent('SYNC_CHATS_COMPLETE', { count: sortedChats.length });
    } catch (error) {
      console.error('Error syncing chats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChat = async (chatId: string) => {
    // Special case for refreshing the chat list
    if (chatId === 'refresh') {
      setHasFetchedChats(false)
      return
    }

    debugEvent('LOAD_CHAT_START', { chatId });

    try {
      setIsLoading(true)

      // First try to load from localStorage using our persistence helper
      const loadedChat = persistenceHelper.loadChat(chatId);
      if (loadedChat && loadedChat.messages.length > 0) {
        debugEvent('LOAD_CHAT_FROM_LOCAL_STORAGE', { 
          chatId,
          messageCount: loadedChat.messages.length,
          firstMessageRole: loadedChat.messages[0]?.role,
          lastMessageRole: loadedChat.messages[loadedChat.messages.length - 1]?.role
        });

        // Force type assertion to avoid TypeScript errors
        setMessages(loadedChat.messages as Message[]);
        setCurrentChatId(chatId);
        
        // Make sure we update currentChat in localStorage
        persistenceHelper.saveCurrentChat(loadedChat.messages, chatId);
        setIsLoading(false);
        
        // Check if we need to fetch from server for the latest messages
        fetchLatestChatMessages(chatId);
        
        debugEvent('LOAD_CHAT_SUCCESS', { source: 'localStorage', chatId });
        return;
      }

      debugEvent('LOAD_CHAT_FROM_SERVER', { chatId });
      
      // If not in localStorage or parsing failed, fetch from server
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const response = await fetchWithAuth(`${apiUrl}/api/chats/${chatId}/`);
      
      if (!response.ok) {
        throw new Error('Failed to load chat')
      }

      const chat = await response.json()
      if (chat.messages && Array.isArray(chat.messages)) {
        // Sort messages by date and validate them with our persistence helper
        const sortedMessages = [...chat.messages].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        // Use our persistence helper to ensure proper role typing
        const validatedMessages = persistenceHelper.castRolesToLiterals(sortedMessages);
        
        debugEvent('LOAD_CHAT_MESSAGES_FROM_SERVER', { 
          messageCount: validatedMessages.length,
          roles: validatedMessages.map(m => m.role)
        });
        
        // Force type assertion to avoid TypeScript errors
        setMessages(validatedMessages as Message[]);
        setCurrentChatId(chat.id);
        
        // Save to localStorage for future quick access using our persistence helper
        const chatToSave: Chat = {
          id: chatId,
          title: chat.title || (validatedMessages[0]?.content.substring(0, 30) + '...'),
          createdAt: chat.createdAt || new Date().toISOString(),
          messages: validatedMessages
        };
        
        persistenceHelper.saveChat(chatToSave);
        persistenceHelper.saveCurrentChat(validatedMessages, chatId);
        
        debugEvent('LOAD_CHAT_SUCCESS', { source: 'server', chatId });
      }
    } catch (error) {
      debugEvent('LOAD_CHAT_ERROR', { error });
      console.error('Error loading chat:', error)
      alert('Failed to load chat')
      handleNewChat()
    } finally {
      setIsLoading(false)
    }
  }

  // Helper to fetch latest messages for a chat
  const fetchLatestChatMessages = async (chatId: string) => {
    if (!userInfo) return;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const response = await fetchWithAuth(`${apiUrl}/api/chats/${chatId}/`);
      
      if (!response.ok) {
        console.log('Chat not found on server or other error', response.status);
        return;
      }
      
      const data = await response.json();
      if (data.messages && Array.isArray(data.messages) && data.messages.length > messages.length) {
        // Server has more messages, update local state
        const sortedMessages = [...data.messages].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        const validatedMessages = persistenceHelper.castRolesToLiterals(sortedMessages);
        setMessages(validatedMessages as Message[]);
        
        // Update localStorage
        persistenceHelper.saveCurrentChat(validatedMessages, chatId);
        
        // Update chat in the list
        updateChatInList(chatId, validatedMessages);
        
        debugEvent('UPDATED_CHAT_FROM_SERVER', { 
          chatId,
          newMessageCount: data.messages.length,
          oldMessageCount: messages.length
        });
      }
    } catch (error) {
      console.error('Error fetching latest chat messages:', error);
    }
  };

  // Helper to update a chat in the list
  const updateChatInList = (chatId: string, messages: any[]) => {
    setChats(prev => {
      const exists = prev.some(chat => chat.id === chatId);
      if (exists) {
        return prev.map(chat => 
          chat.id === chatId ? {
            ...chat,
            title: (messages[0]?.content || '').substring(0, 30) + '...',
            messages: messages
          } : chat
        );
      }
      return prev;
    });
  };

  const handleNewChat = () => {
    debugEvent('NEW_CHAT_START');
    
    // Save the current chat to localStorage before clearing
    if (messages.length > 0 && currentChatId) {
      debugEvent('SAVING_CURRENT_CHAT_BEFORE_NEW', { chatId: currentChatId, messageCount: messages.length });
      
      // Save using our persistence helper
      const validatedMessages = persistenceHelper.castRolesToLiterals(messages);
      
      const chatToSave: Chat = {
        id: currentChatId,
        title: (messages[0]?.content || '').substring(0, 30) + '...',
        createdAt: messages[0]?.createdAt || new Date().toISOString(),
        messages: validatedMessages
      };
      
      persistenceHelper.saveChat(chatToSave);
      
      // Update the chat in the list
      updateChatInList(currentChatId, validatedMessages);
    }
    
    // Clear current chat from state and localStorage
    debugEvent('CLEARING_CURRENT_CHAT');
    setMessages([]);
    setCurrentChatId(null);
    localStorage.removeItem('currentChat');
    
    debugEvent('NEW_CHAT_COMPLETE');
  }

  // Filter chats based on search query
  const filteredChats = useMemo(() => {
    // Create a Map to ensure uniqueness by ID
    const uniqueChats = new Map();
    
    // Helper to check if a chat should be included based on search
    const matchesSearch = (chat: Chat) => {
      if (!searchQuery) return true;
      return chat.title.toLowerCase().includes(searchQuery.toLowerCase());
    };
    
    // Process chats, keeping the most recent version of each chat
    chats.forEach(chat => {
      // Only include if it matches search criteria
      if (matchesSearch(chat)) {
        if (!uniqueChats.has(chat.id)) {
          uniqueChats.set(chat.id, chat);
        } else {
          // If we already have this chat, keep the one with the most recent updatedAt
          const existingChat = uniqueChats.get(chat.id);
          if (new Date(chat.createdAt) > new Date(existingChat.createdAt)) {
            uniqueChats.set(chat.id, chat);
          }
        }
      }
    });
    
    // Convert map to array and sort by creation date (newest first)
    return Array.from(uniqueChats.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [chats, searchQuery]);

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
  }, [filteredChats])

  const handleMoreClick = () => {
    if (chatListRef.current) {
      const scrollAmount = chatListRef.current.clientHeight * 0.8 // Scroll 80% of visible height
      chatListRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' })
    }
  }

  // --- handleSendMessage (Refactored for EventSource) --- 
    // --- handleSendMessage (Refactored for EventSource with Stream Token) --- 
    const handleSendMessage = async (content: string, useApi = false, apiProvider = 'nebius') => {
      if (!content.trim()) return;
      
      setError(null); // Clear any previous errors
      
      const userMessage = {
        id: Date.now().toString(),
        content,
        role: 'user' as const,
        createdAt: new Date().toISOString(),
      };
      
      // Optimistically add user message to UI
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      
      // Create a temporary placeholder for the assistant's response
      const tempAssistantId = `temp-${Date.now()}`;
      const tempAssistantMessage = {
        id: tempAssistantId,
        content: '',
        role: 'assistant' as const,
        createdAt: new Date().toISOString(),
      };
      
      // Add the temporary assistant message
      setMessages([...newMessages, tempAssistantMessage]);
      
      // Reset thinking content
      setThinkingContent(null);
      setIsThinkingComplete(false);
      
      setIsLoading(true);
      
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
        const endpoint = `${apiUrl}/api/chat/stream/?session_id=${currentChatId || "new"}`;
        
        // Close any existing EventSource connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        
        // Get access token from cookies
        const accessToken = getCookie('access_token');
        
        if (!accessToken) {
          setError('You are not authenticated. Please log in again.');
          setIsLoading(false);
          return;
        }
        
        // Create a custom EventSource with authorization header
        const eventSourceUrl = `${endpoint}&query=${encodeURIComponent(content)}`;
        
        console.log('Creating EventSourcePolyfill with URL:', eventSourceUrl);
        
        // Create a custom EventSource with authorization header and improved configuration
        const eventSource = new EventSourcePolyfill(eventSourceUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'text/event-stream',
          },
          heartbeatTimeout: 90000, // Extend timeout to 90 seconds
          withCredentials: false, // Don't send cookies with cross-origin requests
        });
        
        eventSourceRef.current = eventSource;
        
        let fullResponse = '';
        let interactionId = null;
        
        // Define event handlers
        eventSource.onopen = () => {
          console.log('SSE connection opened');
        };
        
        eventSource.onerror = (error) => {
          console.error('SSE error:', error);
          eventSource.close();
          eventSourceRef.current = null;
          
          // Show error message to user
          setError('Connection error. Please try again.');
          setIsLoading(false);
        };
        
        // Handle the initialization event to get the interaction ID
        eventSource.addEventListener('init', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            interactionId = data.interaction_id;
            console.log('Interaction ID:', interactionId);
          } catch (error) {
            console.error('Error parsing init event:', error);
          }
        });
        
        // Handle data events (the actual response chunks)
        eventSource.addEventListener('token', (event: any) => {  // Changed to 'token' event
          try {
            console.log('Received token event:', event.data);
            const data = JSON.parse(event.data);
            fullResponse += data.token || ''; // Changed to data.token
            
            // Update the assistant message content
            setMessages((currentMessages) => {
              return currentMessages.map((msg) => {
                if (msg.id === tempAssistantId) {
                  return {
                    ...msg,
                    content: fullResponse,
                  };
                }
                return msg;
              });
            });
          } catch (error) {
            console.error('Error parsing token event:', error, event.data);
          }
        });
        
        // Also handle source events
        eventSource.addEventListener('sources', (event: any) => {
          try {
            console.log('Received sources event:', event.data);
            const data = JSON.parse(event.data);
            const sources = data.sources || [];
            
            if (sources.length > 0) {
              const sourcesText = "\n\n---\n**Sources:**\n" + 
                sources.map((s: string) => `- ${s}`).join('\n');
              
              fullResponse += sourcesText;
              
              // Update with sources
              setMessages((currentMessages) => {
                return currentMessages.map((msg) => {
                  if (msg.id === tempAssistantId) {
                    return {
                      ...msg,
                      content: fullResponse,
                    };
                  }
                  return msg;
                });
              });
            }
          } catch (error) {
            console.error('Error parsing sources event:', error);
          }
        });
        
        // Handle the end event
        eventSource.addEventListener('end', () => {
          console.log('SSE stream ended');
          
          // Finalize the assistant message
          finalizeMessageState(tempAssistantId, interactionId, fullResponse);
          
          // Close the connection
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
          
          // If this was a new chat, update the chat ID
          if (!currentChatId) {
            // Fetch chats to get the new chat ID
            fetchChats();
          }
        });
        
        // Handle error events
        eventSource.addEventListener('error', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            setError(data.error || 'An error occurred');
          } catch (error) {
            setError('An error occurred during streaming');
          }
          
          eventSource.close();
          eventSourceRef.current = null;
          setIsLoading(false);
        });
        
      } catch (error) {
        console.error('Error in handleSendMessage:', error);
        setError('Failed to send message. Please try again.');
        setIsLoading(false);
      }
    };

  // --- Helper function to finalize message state ---
  const finalizeMessageState = (tempId: string, finalId: string | null, finalContent: string) => {
      debugEvent('FINALIZE_ASSISTANT_MESSAGE', { finalId: finalId, tempId: tempId });
      setMessages(prev => {
           if (!prev || prev.length === 0) return [];
           const lastMessageIndex = prev.length - 1;
           // Ensure the last message still has the temporary ID before updating
           if (prev[lastMessageIndex]?.id === tempId) {
               return [
                   ...prev.slice(0, lastMessageIndex),
                   // Update ID if available, ensure final content is set
                   { ...prev[lastMessageIndex], id: finalId || tempId, content: finalContent } 
               ];
           }
           // If the ID somehow already changed or the last message isn't the temp one, return previous state
           return prev; 
      });
       setIsLoading(false); // Ensure loading is false
  };

  // --- Modify stopGeneration to close EventSource ---
  const stopGeneration = async () => {
    // Remove the fetch call to /api/chat/cancel if it exists
    // ... (keep existing logic if needed for other things) ...
    
    if (eventSourceRef.current) {
      debugEvent('STOP_GENERATION_CLOSING_EVENTSOURCE');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsLoading(false);
      
      // Finalize the state with whatever content was received so far
      // Need the temp ID and accumulated content from the scope where handleSendMessage runs
      // This part is tricky - stopGeneration doesn't have direct access to tempAssistantId or finalAssistantContent
      // Option 1: Store them in state (more complex)
      // Option 2: Do a less precise finalization based on the last message in state
      setMessages(prev => {
          if (!prev || prev.length === 0) return prev;
          const lastMessage = prev[prev.length - 1];
          if (lastMessage.role === 'assistant' && lastMessage.content.length >= 0) { 
              return prev; 
          }
          return prev;
      }); // <-- FIXED: Correct closing braces and removed trailing semicolon
    } else {
        debugEvent('STOP_GENERATION_NO_EVENTSOURCE');
        setIsLoading(false);
    }
  };

  const deleteChat = async (chatId: string) => {
    try {
      debugEvent('DELETE_CHAT_START', { chatId });
      
      // First remove from state to update UI immediately
      setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
      
      // Then remove from localStorage
      localStorage.removeItem(`chat_${chatId}`);
      
      // Remove any ID mappings related to this chat
      if (serverGeneratedChatIds[chatId]) {
        setServerGeneratedChatIds(prev => {
          const newMappings = { ...prev };
          delete newMappings[chatId];
          return newMappings;
        });
      }
      
      // If it was the current chat, create a new one
      if (currentChatId === chatId) {
        handleNewChat();
      }
      
      // Finally, remove from server
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const response = await fetchWithAuth(`${apiUrl}/api/chats/${chatId}/`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        debugEvent('DELETE_CHAT_SUCCESS', { chatId });
      } else {
        // If the server request fails, revert the state change
        fetchChats(); // Refresh the chat list from server
        debugEvent('DELETE_CHAT_SERVER_ERROR', { status: response.status });
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      debugEvent('DELETE_CHAT_ERROR', { error });
      // If there's an error, refresh the chat list to ensure consistency
      fetchChats();
    } finally {
      // Ensure chats are up-to-date
      setHasFetchedChats(false);
    }
  };

  const handleSettingsClick = () => {
    router.push('/settings')
  }

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (skipDeleteConfirm) {
      deleteChat(chatId);
    } else {
      setChatToDelete(chatId);
    }
  };

  const handleSkipDeleteConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setSkipDeleteConfirm(newValue);
    localStorage.setItem('skipDeleteConfirm', newValue.toString());
  };

  const handleDeleteConfirm = () => {
    if (chatToDelete) {
      deleteChat(chatToDelete);
      setChatToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setChatToDelete(null);
  };

  // Add a fix for assistant messages persistence on refresh
  useEffect(() => {
    // This ensures proper role serialization when page loads
    const fixAssistantMessagesInLocalStorage = () => {
      try {
        Object.keys(localStorage).forEach(key => {
          if (key === 'currentChat' || key.startsWith('chat_')) {
            try {
              const data = localStorage.getItem(key);
              if (data) {
                const parsed = JSON.parse(data);
                
                if (parsed.messages && Array.isArray(parsed.messages)) {
                  // Force correct role type serialization
                  const fixedMessages = parsed.messages.map(msg => ({
                    ...msg,
                    // Explicitly store roles as strings
                    role: msg.role === 'assistant' ? 'assistant' : 'user'
                  }));
                  
                  // Check if any messages were fixed
                  const hadFixes = JSON.stringify(fixedMessages) !== JSON.stringify(parsed.messages);
                  
                  if (hadFixes) {
                    console.log(`Fixing messages for ${key} - found role issues`);
                    
                    // Save fixed version back to localStorage
                    if (key === 'currentChat') {
                      localStorage.setItem(key, JSON.stringify({
                        ...parsed,
                        messages: fixedMessages
                      }));
                    } else {
                      localStorage.setItem(key, JSON.stringify({
                        ...parsed,
                        messages: fixedMessages
                      }));
                    }
                  }
                }
              }
            } catch (e) {
              console.error(`Error fixing ${key}:`, e);
            }
          }
        });
      } catch (error) {
        console.error('Error fixing localStorage:', error);
      }
    };

    // Run fix on page load, after a short delay to ensure everything is initialized
    const timer = setTimeout(() => {
      fixAssistantMessagesInLocalStorage();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // Add useEffect to keep chat sidebar in sync with current chat
  useEffect(() => {
    // When currentChatId changes, make sure that chat is highlighted in the sidebar
    if (currentChatId) {
      // Check if the current chat is in the chats list
      const chatExists = chats.some(chat => chat.id === currentChatId);
      
      // If not, we should refresh the chat list
      if (!chatExists && !isLoading) {
        debugEvent('CURRENT_CHAT_NOT_IN_LIST', { currentChatId });
        setHasFetchedChats(false);
      }
    }
  }, [currentChatId, chats]);

  // Add this section for handling model selection
  const selectModelType = (model: string) => {
    setModelType(model);
    setShowModelOptions(false);
    localStorage.setItem('modelType', model);
    
    // Display a toast or notification that model has been changed
    // This would be a good place to add a toast notification if available
    console.log(`Model changed to: ${model}`);
  };

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    // Clear auth cookies
    deleteCookie('access_token');
    deleteCookie('refresh_token');
    
    // Close any active EventSource connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Reset state
    setMessages([]);
    setCurrentChatId(null);
    setChats([]);
    setUserInfo(null);
    setAuthStatus('unauthenticated');
    
    // Redirect to login page
    router.push('/auth/signin');
  };

  // --- Central Auth/Profile Effect --- 
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check for access token in cookies
        const token = document.cookie.split('; ').find(row => row.startsWith('access_token='));
        
        if (!token) {
          setAuthStatus('unauthenticated');
          router.push('/auth/signin');
          return;
        }
        
        // Attempt to fetch user profile to verify token validity
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
        const profileResponse = await fetchWithAuth(`${apiUrl}/api/profile/me/`);
        
        if (profileResponse.ok) {
          const userData = await profileResponse.json();
          setUserInfo({
            name: `${userData.first_name} ${userData.last_name}`.trim(),
            email: userData.email,
            institution: userData.profile?.institution,
            role: userData.profile?.role,
            image: userData.profile?.image,
          });
          setAuthStatus('authenticated');
          
          // Load chats if authenticated
          fetchChats();
        } else {
          // Token is invalid or expired
          setAuthStatus('unauthenticated');
          router.push('/auth/signin');
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setAuthStatus('unauthenticated');
        router.push('/auth/signin');
      }
    };
    
    checkAuth();
  }, []);

  // This useEffect fixes message rendering issues by ensuring
  // that empty assistant messages are filtered out and the state is updated correctly
  useEffect(() => {
    const fixEmptyAssistantMessages = () => {
      // Only run when there are messages and not loading
      if (messages.length > 0 && !isLoading) {
        // Check for empty assistant messages and fix them
        const hasEmptyAssistantMessage = messages.some(m => 
          m.role === 'assistant' && m.content.trim() === ''
        );
        
        if (hasEmptyAssistantMessage) {
          debugEvent('FIXING_EMPTY_ASSISTANT_MESSAGES', { messageCount: messages.length });
          
          // Filter out empty assistant messages
          setMessages(prev => prev.filter(m => 
            m.role !== 'assistant' || m.content.trim() !== ''
          ));
        }
      }
    };
    
    fixEmptyAssistantMessages();
  }, [messages, isLoading]);

  // Handle click outside the profile dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isProfileOpen]);

  if (authStatus === 'loading') {
    console.log("Auth status is loading, rendering Loading component.");
    return <Loading />
  }

  if (authStatus === 'unauthenticated') {
    console.log("Auth status is unauthenticated, redirecting to signin.");
    if (typeof window !== 'undefined') {
       router.push('/auth/signin')
    }
    return <Loading />;
  }

  return (
    <div className="flex h-screen relative">
      {/* Burger Menu for Minimized State */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className={`fixed top-2 left-2 p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-gray-500 dark:text-gray-400 z-50 ${
          isSidebarOpen ? 'hidden' : 'block'
        }`}
      >
        <svg className="w-6 h-6 text-gray-500 dark:text-gray-300" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7.99994 10 6 11.9999l1.99994 2M11 5v14m-7 0h16c.5523 0 1-.4477 1-1V6c0-.55228-.4477-1-1-1H4c-.55228 0-1 .44772-1 1v12c0 .5523.44772 1 1 1Z"/>
        </svg>
      </button>

      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 h-full z-40 transition-transform duration-200 ease-in-out ${ 
          isSidebarOpen ? 'translate-x-0' : '-translate-x-[280px]'
        }`}
      >
        <div className="h-full w-[280px] left-pane graph-paper-bg flex flex-col">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between h-16 px-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-md transition-colors text-gray-500 dark:text-gray-300"
              >
                <svg className="w-6 h-6 text-gray-500 dark:text-gray-300" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7.99994 10 6 11.9999l1.99994 2M11 5v14m-7 0h16c.5523 0 1-.4477 1-1V6c0-.55228-.4477-1-1-1H4c-.55228 0-1 .44772-1 1v12c0 .5523.44772 1 1 1Z"/>
                </svg>
              </button>
              <div className="relative" ref={modelMenuRef}>
                <button
                  onClick={() => setShowModelOptions(!showModelOptions)}
                  className="flex items-center text-lg font-extrabold text-gray-900 dark:text-gray-100 hover:opacity-80 transition-opacity focus:outline-none"
                >
                  WHIRL
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    modelType === 'base' 
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-300'
                  }`}>
                    {modelType === 'base' && 'Base'}
                    {modelType === 'fine-tuned' && 'FT'}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-3 h-3 ml-1 transition-transform ${
                      showModelOptions ? 'rotate-180' : ''
                    }`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                
                {/* Model options dropdown */}
                {showModelOptions && (
                  <div className="absolute left-0 top-full mt-1 z-10 w-72 rounded-xl shadow-lg bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700/50 overflow-hidden">
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700/50">
                      Select Model
                    </div>
                    <button
                      onClick={() => selectModelType('base')}
                      className={`flex items-center w-full px-3.5 py-2.5 text-xs text-left ${
                        modelType === 'base'
                          ? 'bg-gray-50/70 dark:bg-gray-700/20 text-gray-700 dark:text-gray-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50/70 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">WHIRL-Base (Llama3.2-3B)</span>
                        <span className="text-xs opacity-70 mt-0.5">Base Llama 3.2 3B model for general queries</span>
                      </div>
                      {modelType === 'base' && (
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => selectModelType('fine-tuned')}
                      className={`flex items-center w-full px-3.5 py-2.5 text-xs text-left ${
                        modelType === 'fine-tuned'
                          ? 'bg-gray-50/70 dark:bg-gray-700/20 text-gray-700 dark:text-gray-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50/70 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">WHIRL-FT (Llama3.2-3B)</span>
                        <span className="text-xs opacity-70 mt-0.5">Fine-tuned model optimized for RAG</span>
                      </div>
                      {modelType === 'fine-tuned' && (
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleNewChat}
                className="p-2 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-md transition-colors text-gray-500 dark:text-gray-300"
                title="New chat"
              >
                <svg className="w-6 h-6 text-gray-500 dark:text-gray-300" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m14.304 4.844 2.852 2.852M7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4.5m2.409-9.91a2.017 2.017 0 0 1 0 2.853l-6.844 6.844L8 14l.713-3.565 6.844-6.844a2.015 2.015 0 0 1 2.852 0Z"/>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Logo above Search - Increased bottom margin */}
          <div className="flex justify-center px-4 py-2 mb-10">
            <Image 
              src="/logo2.png" 
              alt="Logo" 
              width={100} // Keep width, height will scale
              height={100} // Keep height, width will scale
              priority // Load priority if it's important LCP
              className="h-24 w-auto" // Increased height to h-24
            />
          </div>
          
          {/* Search Input */}
          <div className="px-3 pb-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-3xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-all border border-gray-200 dark:border-gray-700 shadow-md hover:shadow-lg transform transition-transform duration-150 hover:-translate-y-0.5"
              />
              <MagnifyingGlassIcon className="absolute left-3.5 top-2.5 h-5 w-5 text-gray-500 dark:text-gray-400 stroke-2" />
            </div>
          </div>
          
          {/* Chat History */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-4" ref={chatListRef}>
            {filteredChats.length > 0 && (
              <>
                {/* Group chats by date */}
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);
                  
                  const previousWeekStart = new Date(today);
                  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
                  
                  const todayChats = filteredChats.filter(chat => {
                    const chatDate = new Date(chat.createdAt);
                    chatDate.setHours(0, 0, 0, 0);
                    return chatDate.getTime() === today.getTime();
                  });
                  
                  const yesterdayChats = filteredChats.filter(chat => {
                    const chatDate = new Date(chat.createdAt);
                    chatDate.setHours(0, 0, 0, 0);
                    return chatDate.getTime() === yesterday.getTime();
                  });
                  
                  const previousWeekChats = filteredChats.filter(chat => {
                    const chatDate = new Date(chat.createdAt);
                    chatDate.setHours(0, 0, 0, 0);
                    return chatDate.getTime() < yesterday.getTime() && chatDate.getTime() >= previousWeekStart.getTime();
                  });
                  
                  const olderChats = filteredChats.filter(chat => {
                    const chatDate = new Date(chat.createdAt);
                    chatDate.setHours(0, 0, 0, 0);
                    return chatDate.getTime() < previousWeekStart.getTime();
                  });
                  
                  return (
                    <>
                      {todayChats.length > 0 && (
                        <>
                          <h3 className="font-medium text-base py-3">Today</h3>
                          {todayChats.map((chat) => (
                            <div key={chat.id} className="flex items-center group relative">
                              <button
                                onClick={() => {
                                  debugEvent('CHAT_SIDEBAR_CLICK', { 
                                    chatId: chat.id, 
                                    title: chat.title,
                                    messageCount: chat.messages.length
                                  });
                                  loadChat(chat.id);
                                }}
                                className={`flex items-center w-full px-2 py-3 text-left transition-colors ${
                                  currentChatId === chat.id 
                                    ? 'text-gray-900 dark:text-white' 
                                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                }`}
                              >
                                <span className="flex-shrink-0 text-gray-500 dark:text-gray-400 mr-3">
                                  <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M5 7h14M5 12h14M5 17h10"/>
                                  </svg>
                                </span>
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-grow pr-6">
                                  {chat.title}
                                </span>
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(chat.id, e)}
                                className="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1/2 transform -translate-y-1/2"
                                aria-label="Delete chat"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18"></path>
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {yesterdayChats.length > 0 && (
                        <>
                          <h3 className="font-medium text-base py-3">Yesterday</h3>
                          {yesterdayChats.map((chat) => (
                            <div key={chat.id} className="flex items-center group relative">
                              <button
                                onClick={() => {
                                  debugEvent('CHAT_SIDEBAR_CLICK', { 
                                    chatId: chat.id, 
                                    title: chat.title,
                                    messageCount: chat.messages.length
                                  });
                                  loadChat(chat.id);
                                }}
                                className={`flex items-center w-full px-2 py-3 text-left transition-colors ${
                                  currentChatId === chat.id 
                                    ? 'text-gray-900 dark:text-white' 
                                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                }`}
                              >
                                <span className="flex-shrink-0 text-gray-500 dark:text-gray-400 mr-3">
                                  <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M5 7h14M5 12h14M5 17h10"/>
                                  </svg>
                                </span>
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-grow pr-6">
                                  {chat.title}
                                </span>
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(chat.id, e)}
                                className="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1/2 transform -translate-y-1/2"
                                aria-label="Delete chat"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18"></path>
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {previousWeekChats.length > 0 && (
                        <>
                          <h3 className="font-medium text-base py-3">Previous 7 Days</h3>
                          {previousWeekChats.map((chat) => (
                            <div key={chat.id} className="flex items-center group relative">
                              <button
                                onClick={() => {
                                  debugEvent('CHAT_SIDEBAR_CLICK', { 
                                    chatId: chat.id, 
                                    title: chat.title,
                                    messageCount: chat.messages.length
                                  });
                                  loadChat(chat.id);
                                }}
                                className={`flex items-center w-full px-2 py-3 text-left transition-colors ${
                                  currentChatId === chat.id 
                                    ? 'text-gray-900 dark:text-white' 
                                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                }`}
                              >
                                <span className="flex-shrink-0 text-gray-500 dark:text-gray-400 mr-3">
                                  <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M5 7h14M5 12h14M5 17h10"/>
                                  </svg>
                                </span>
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-grow pr-6">
                                  {chat.title}
                                </span>
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(chat.id, e)}
                                className="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1/2 transform -translate-y-1/2"
                                aria-label="Delete chat"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18"></path>
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {olderChats.length > 0 && (
                        <>
                          <h3 className="font-medium text-base py-3">Older</h3>
                          {olderChats.map((chat) => (
                            <div key={chat.id} className="flex items-center group relative">
                              <button
                                onClick={() => {
                                  debugEvent('CHAT_SIDEBAR_CLICK', { 
                                    chatId: chat.id, 
                                    title: chat.title,
                                    messageCount: chat.messages.length
                                  });
                                  loadChat(chat.id);
                                }}
                                className={`flex items-center w-full px-2 py-3 text-left transition-colors ${
                                  currentChatId === chat.id 
                                    ? 'text-gray-900 dark:text-white' 
                                    : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                }`}
                              >
                                <span className="flex-shrink-0 text-gray-500 dark:text-gray-400 mr-3">
                                  <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M5 7h14M5 12h14M5 17h10"/>
                                  </svg>
                                </span>
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-grow pr-6">
                                  {chat.title}
                                </span>
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(chat.id, e)}
                                className="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1 top-1/2 transform -translate-y-1/2"
                                aria-label="Delete chat"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18"></path>
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  );
                })()}
                
                {showMore && (
                  <button 
                    onClick={handleMoreClick}
                    className="flex items-center text-sm text-gray-600 dark:text-gray-400 mt-2 px-2 py-2 w-full hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    More
                  </button>
                )}
              </>
            )}
          </div>
          
          {/* User Information Footer */}
          {(userInfo?.institution || userInfo?.role) && (
            <div className="mt-auto px-4 py-3">
              <div className="flex flex-col items-center text-center text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <div>Institution: {userInfo?.institution}</div>
                <div>Role: {userInfo?.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logo for CLOSED Sidebar State (Fixed Centered) */}
      {!isSidebarOpen && messages.length > 0 && (
        <img 
          src="/logo_.png" 
          alt="Mini Logo Centered" 
          className="fixed top-4 left-1/2 -translate-x-1/2 w-10 h-10 z-10 animate-spin-slow" 
        />
      )}

      {/* Main Content */}
      <div 
        className={`relative flex-1 flex flex-col h-full ${ // Add relative back for absolute child
          isSidebarOpen ? 'ml-[280px]' : 'ml-0'
        } transition-all duration-200 graph-paper-bg`}
      >
        {/* Logo for OPEN Sidebar State (Absolute Top Left) */}
        {isSidebarOpen && messages.length > 0 && (
          <img 
            src="/logo_.png" 
            alt="Mini Logo Top Left" 
            className="absolute top-4 left-6 w-10 h-10 z-10 animate-spin-slow" 
          />
        )}

        {/* Top Bar */}
        <header className="fixed top-0 left-0 right-0 z-30">
          <div className={`flex items-center justify-between h-20 ${
            isSidebarOpen ? 'pl-[295px]' : 'pl-16'
          } pr-4 transition-all duration-200`}>
            <div className="flex items-center">
              {/* User Profile Dropdown */}
              <div className="absolute right-4 top-5">
                <div className="flex items-center space-x-1">
                  <GridToggle />
                  <ThemeToggle />
                  <div ref={profileDropdownRef} className="relative">
                    <button
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                      className="flex items-center space-x-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {userInfo?.image ? (
                        <Image
                          src={userInfo.image}
                          alt={userInfo.name || 'Profile'}
                          width={32}
                          height={32}
                          className="rounded-full"
                          unoptimized={true}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {userInfo?.name?.[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                      )}
                      <ChevronDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </button>

                    {/* Dropdown Menu */}
                    {isProfileOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-800 rounded-lg shadow-lg py-1 z-50 border border-gray-200 dark:border-neutral-700">
                        <div className="px-4 py-2 border-b border-gray-100 dark:border-neutral-700">
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{userInfo?.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{userInfo?.email}</div>
                          {(userInfo?.institution || userInfo?.role) && (
                            <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
                              {userInfo?.institution && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Institution: {userInfo.institution}
                                </div>
                              )}
                              {userInfo?.role && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Role: {userInfo.role}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={handleSettingsClick}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center space-x-2"
                        >
                          <Cog6ToothIcon className="h-5 w-5 text-gray-600 dark:text-gray-300 stroke-2" />
                          <span>Settings</span>
                        </button>
                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center space-x-2"
                        >
                          <ArrowRightOnRectangleIcon className="h-5 w-5 text-gray-600 dark:text-gray-300 stroke-2" />
                          <span>Log out</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto scrollbar-hide pt-12">
          {/* Display Error Message */}
          {error && (
            <div className="p-4 max-w-3xl mx-auto">
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-200/30 dark:border-red-900/30 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
                <button 
                  onClick={() => setError(null)}
                  className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-800 dark:text-red-200 opacity-75 hover:opacity-100"
                >
                  <svg className="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Removed relative positioning from here */}
          <div className="max-w-3xl mx-auto px-4 py-4 h-full">

            {/* Mini logo REMOVED from here */}

            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center">
                  <button 
                    className="logo-button mb-3 animate-spin-slow"
                    onMouseEnter={() => setIsLogoHovered(true)}
                    onMouseLeave={() => setIsLogoHovered(false)}
                  >
                    <img 
                      src={isLogoHovered ? "/logo_stop.png" : "/logo_.png"} 
                      alt="WHIRL Logo" 
                      className="w-28 h-28 object-contain"
                    />
                  </button>
                  <p className="text-4xl text-gray-800 dark:text-gray-200 mb-3">
                    <span className="font-bold">Hello,</span> <span className="rainbow-text">{userInfo?.name?.split(' ')[0]}</span>
                  </p>
                  <p className="text-lg text-gray-600 dark:text-gray-300">
                    Ask me anything about women's health.
                  </p>
                </div>
              </div>
            )}
            <ChatMessages messages={messages} isLoading={isLoading} />
            
            {/* Add ThinkingDisplay component when thinkingContent is available */}
            {thinkingContent && (
              <ThinkingDisplay 
                content={thinkingContent} 
                isComplete={isThinkingComplete} 
              />
            )}
          </div>
        </main>

        {/* Input Area */}
        <div className="p-4">
          <div className="max-w-3xl mx-auto">
            <ChatInput 
              onSendMessage={handleSendMessage} 
              isLoading={isLoading} 
              onStopGeneration={stopGeneration} 
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {chatToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg max-w-sm w-full mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Delete Chat
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Are you sure you want to delete this chat? This action cannot be undone.
              </p>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="skipDeleteConfirm"
                  checked={skipDeleteConfirm}
                  onChange={handleSkipDeleteConfirmChange}
                  className="h-4 w-4 text-gray-500 rounded border-gray-300 dark:border-gray-600 focus:ring-gray-500 dark:focus:ring-gray-400 dark:bg-gray-700"
                />
                <label htmlFor="skipDeleteConfirm" className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  Don't show this confirmation again
                </label>
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 dark:bg-zinc-900/50 flex justify-end space-x-2">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 