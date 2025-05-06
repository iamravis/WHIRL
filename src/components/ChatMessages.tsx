'use client'

import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import dynamic from 'next/dynamic'
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { SparklesIcon } from '@heroicons/react/24/outline'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import katex from 'katex'
import DOMPurify from 'dompurify'
import { useTheme } from 'next-themes'
import { ClipboardIcon, CheckIcon, HandThumbUpIcon, HandThumbDownIcon, ChevronUpIcon, ChevronDownIcon, ChatBubbleLeftIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { HandThumbUpIcon as HandThumbUpSolidIcon, HandThumbDownIcon as HandThumbDownSolidIcon, ChatBubbleLeftIcon as ChatBubbleLeftSolidIcon } from '@heroicons/react/24/solid'
import { VerticalBarsLoading } from './Loading'

// Dynamically import SyntaxHighlighter 
const DynamicSyntaxHighlighter = dynamic(() => import('react-syntax-highlighter').then(mod => mod.Prism), { ssr: false });

// Define interface for message
interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  createdAt: string
}

// Define props for ChatMessages component
interface ChatMessagesProps {
  messages: Message[]
  isLoading?: boolean
}

// Define ThinkingDisplay component
export function ThinkingDisplay({ content, isComplete }: { content: string, isComplete: boolean }) {
  return (
    <div className="thinking-container bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-2 w-full">
      <div className="flex items-center gap-2 mb-2">
        <SparklesIcon className="h-5 w-5 text-gray-700 dark:text-gray-300 stroke-2" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Thinking...</span>
      </div>
      <pre className="thinking-content overflow-auto max-h-[200px] text-sm font-mono whitespace-pre-wrap text-gray-700 dark:text-gray-300">
        {content}
      </pre>
    </div>
  );
}

// Preprocesses markdown content
const preprocessMarkdown = (content: string): string => {
  if (!content) return '';
  
  // Ensure proper heading formatting with space after #
  content = content.replace(/^(#{1,6})([^ #])/gm, '$1 $2');
  
  // Ensure proper list formatting with space after bullet
  content = content.replace(/^([*-])([^ ])/gm, '$1 $2');
  
  // Simplify citation formats with subtle superscript references
  // Replace citation patterns like [1], (1), 1 with superscript references
  content = content.replace(/\[(\d+)\]/g, '^$1^');
  content = content.replace(/\((\d+)\)/g, '^$1^');
  
  // Ensure key terms are properly bolded - common pattern in professional docs
  // Look for patterns like "Term:" at the beginning of list items and make them bold
  content = content.replace(/^(\s*[*-] )([^:]+):/gm, '$1**$2**:');
  
  // Handle "Key Features:" type headers that should be bold
  content = content.replace(/^([A-Z][a-z]+ [A-Z][a-z]+):/gm, '**$1**:');
  
  // Make sure single line breaks don't break formatting (common markdown issue)
  content = content.replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
  
  return content;
};

// Export the ChatMessages component
export function ChatMessages({ messages, isLoading = false }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());
  const [dislikedMessages, setDislikedMessages] = useState<Set<string>>(new Set());
  const [thinkingContent, setThinkingContent] = useState<string | null>(null);
  const [isThinkingComplete, setIsThinkingComplete] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(true);
  
  // Comment system state
  const [commentingMessageId, setCommentingMessageId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitted, setCommentSubmitted] = useState(false);
  const commentBoxRef = useRef<HTMLDivElement>(null);

  // Extract thinking content from a message
  const extractThinkingContent = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch && thinkMatch[1]) {
      return thinkMatch[1].trim();
    }
    return null;
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'auto'
      });
    }
  }, [messages]);

  // Update thinking content when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        const thinking = extractThinkingContent(lastMessage.content);
        if (thinking) {
          setThinkingContent(thinking);
          const cleanedContent = lastMessage.content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
          if (cleanedContent) {
            setIsThinkingComplete(true);
            setWaitingForFirstToken(false);
          }
        } else {
          setThinkingContent(null);
          setIsThinkingComplete(false);
        }
      }
    }
  }, [messages]);

  // Reset waitingForFirstToken when a new message starts loading
  useEffect(() => {
    if (isLoading) {
      setWaitingForFirstToken(true);
    }
  }, [isLoading]);

  // Handle copy to clipboard
  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Handle like button
  const handleLike = (messageId: string) => {
    setLikedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
        setDislikedMessages(prev => {
          const newDisliked = new Set(prev);
          newDisliked.delete(messageId);
          return newDisliked;
        });
      }
      return newSet;
    });
  };

  // Handle dislike button
  const handleDislike = (messageId: string) => {
    setDislikedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
        setLikedMessages(prev => {
          const newLiked = new Set(prev);
          newLiked.delete(messageId);
          return newLiked;
        });
      }
      return newSet;
    });
  };

  // Handle comment icon click
  const handleCommentClick = (messageId: string) => {
    setCommentingMessageId(messageId);
    setCommentText('');
    setCommentSubmitted(false);
  };
  
  // Handle comment submit
  const handleCommentSubmit = () => {
    // This would connect to your data collection pipeline in the future
    console.log(`Comment for message ${commentingMessageId}: ${commentText}`);
    setCommentSubmitted(true);
    // Close the comment window after a delay
    setTimeout(() => {
      setCommentingMessageId(null);
      setCommentText('');
    }, 1500);
  };
  
  // Handle comment close
  const handleCommentClose = () => {
    setCommentingMessageId(null);
    setCommentText('');
    setCommentSubmitted(false);
  };

  // Handle click outside the comment box
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (commentBoxRef.current && !commentBoxRef.current.contains(event.target as Node)) {
        handleCommentClose();
      }
    }

    if (commentingMessageId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [commentingMessageId]);

  // If no messages, return null
  if (messages.length === 0) {
    return null;
  }

  // Add custom styles for the markdown content
  const markdownStyles = {
    h1: 'text-2xl font-bold mb-4 mt-6 text-gray-900 dark:text-gray-100',
    h2: 'text-xl font-bold mb-3 mt-5 text-gray-900 dark:text-gray-100',
    h3: 'text-lg font-bold mb-2 mt-4 text-gray-900 dark:text-gray-100',
    p: 'mb-4 text-gray-800 dark:text-gray-200 leading-relaxed',
    ul: 'list-disc pl-6 mb-4 space-y-2',
    ol: 'list-decimal pl-6 mb-4 space-y-2',
    li: 'mb-1',
    a: 'text-blue-600 hover:underline',
    blockquote: 'border-l-4 border-gray-300 dark:border-gray-700 pl-4 italic my-4',
    strong: 'font-bold text-gray-900 dark:text-gray-100',
    em: 'italic',
    code: 'bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 font-mono text-sm',
    sup: 'text-xs text-gray-500 dark:text-gray-400 font-normal ml-0.5',
  };

  // Main render
  return (
    <div 
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto h-full w-full"
      style={{ 
        height: 'calc(100vh - 180px)',
        paddingTop: '2rem',
        paddingBottom: '2rem'
      }}
    >
      <div className="min-h-full w-full pb-4">
        <div className="flex flex-col items-center w-full max-w-5xl mx-auto">
          {messages.map((message) => {
            // Extract thinking content and clean message content
            const thinking = message.role === 'assistant' ? extractThinkingContent(message.content) : null;
            const displayContent = thinking 
              ? message.content.replace(/<think>[\s\S]*?<\/think>/, '').trim() 
              : message.content;
              
            return (
              <div key={message.id} className="group w-full mb-4 message-entrance">
                <div className="flex text-base mx-auto max-w-full">
                  <div className="flex flex-col w-full">
                    {/* Display thinking content if present */}
                    {message.role === 'assistant' && thinking && (
                      <ThinkingDisplay 
                        content={thinking} 
                        isComplete={isThinkingComplete || displayContent.length > 0}
                      />
                    )}
                    
                    {/* User or Assistant message */}
                    {message.role === 'user' ? (
                      <div className="flex flex-col bg-gray-100 dark:bg-gray-800 rounded-3xl p-4 max-w-[80%] self-end">
                        <p className="text-gray-800 dark:text-gray-200">{displayContent}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col w-full p-3">
                        <div className="text-gray-800 dark:text-gray-200 prose prose-sm md:prose-base lg:prose-lg max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-strong:font-bold prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-700 prose-pre:rounded-md prose-img:rounded-md overflow-hidden">
                          {/* Replace RAW display with ReactMarkdown */}
                          <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              h1: ({node, className, children, ...props}) => <h1 className={markdownStyles.h1} {...props}>{children}</h1>,
                              h2: ({node, className, children, ...props}) => <h2 className={markdownStyles.h2} {...props}>{children}</h2>,
                              h3: ({node, className, children, ...props}) => <h3 className={markdownStyles.h3} {...props}>{children}</h3>,
                              p: ({node, className, children, ...props}) => <p className={markdownStyles.p} {...props}>{children}</p>,
                              ul: ({node, className, children, ...props}) => <ul className={markdownStyles.ul} {...props}>{children}</ul>,
                              ol: ({node, className, children, ...props}) => <ol className={markdownStyles.ol} {...props}>{children}</ol>,
                              li: ({node, className, children, ...props}) => <li className={markdownStyles.li} {...props}>{children}</li>,
                              a: ({node, className, children, href, ...props}) => <a className={markdownStyles.a} href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
                              blockquote: ({node, className, children, ...props}) => <blockquote className={markdownStyles.blockquote} {...props}>{children}</blockquote>,
                              strong: ({node, className, children, ...props}) => <strong className={markdownStyles.strong} {...props}>{children}</strong>,
                              em: ({node, className, children, ...props}) => <em className={markdownStyles.em} {...props}>{children}</em>,
                              code: ({node, inline, className, children, ...props}: any) => {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <DynamicSyntaxHighlighter
                                    // @ts-ignore - Ignoring style type issue
                                    style={tomorrow}
                                    language={match[1]}
                                    PreTag="div"
                                    className="rounded-md my-4"
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </DynamicSyntaxHighlighter>
                                ) : (
                                  <code className={markdownStyles.code} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              // Custom component for citation numbers
                              text: ({children}) => {
                                // Replace citation patterns with subtle superscript
                                if (typeof children === 'string' && children.includes('^')) {
                                  return (
                                    <>
                                      {children.split(/\^(\d+)\^/).map((part, i) => {
                                        // Even indices are regular text, odd indices are the numbers
                                        if (i % 2 === 0) {
                                          return part;
                                        }
                                        // Render citation numbers as subtle superscript
                                        return (
                                          <sup 
                                            key={i} 
                                            className={markdownStyles.sup}
                                          >
                                            {part}
                                          </sup>
                                        );
                                      })}
                                    </>
                                  );
                                }
                                return children;
                              }
                            }}
                          >
                            {preprocessMarkdown(displayContent || '')}
                          </ReactMarkdown>
                        </div>
                        
                        {/* Like/Dislike buttons */}
                        {message.content && !isLoading && (
                          <div className="flex justify-between items-center mt-3 mb-1">
                            <div className="flex gap-3">
                              <button 
                                className={`action-button ${copiedMessageId === message.id ? 'success-indicator' : ''}`} 
                                onClick={() => handleCopy(message.content, message.id)}
                                aria-label="Copy message"
                              >
                                {copiedMessageId === message.id ? <CheckIcon className="h-6 w-6 stroke-2" /> : <ClipboardIcon className="h-6 w-6 stroke-2" />}
                              </button>
                              <button 
                                className={`action-button ${likedMessages.has(message.id) ? 'active' : ''}`} 
                                onClick={() => handleLike(message.id)}
                                aria-label="Like message"
                              >
                                {likedMessages.has(message.id) ? <HandThumbUpSolidIcon className="h-6 w-6" /> : <HandThumbUpIcon className="h-6 w-6 stroke-2" />}
                              </button>
                              <button 
                                className={`action-button ${dislikedMessages.has(message.id) ? 'danger' : ''}`} 
                                onClick={() => handleDislike(message.id)}
                                aria-label="Dislike message"
                              >
                                {dislikedMessages.has(message.id) ? <HandThumbDownSolidIcon className="h-6 w-6" /> : <HandThumbDownIcon className="h-6 w-6 stroke-2" />}
                              </button>
                              <button 
                                className={`action-button ${commentingMessageId === message.id ? 'success-indicator' : ''}`} 
                                onClick={() => handleCommentClick(message.id)}
                                aria-label="Provide feedback"
                              >
                                {commentingMessageId === message.id ? <ChatBubbleLeftSolidIcon className="h-6 w-6" /> : <ChatBubbleLeftIcon className="h-6 w-6 stroke-2" />}
                              </button>
                            </div>
                            <div className="relative">
                              {commentingMessageId === message.id && (
                                <div className="comment-bubble" ref={commentBoxRef}>
                                  {!commentSubmitted ? (
                                    <>
                                      <div className="mb-3">
                                        <textarea
                                          className="apple-textarea w-full p-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                          placeholder="What would you like to share about this response?"
                                          rows={3}
                                          value={commentText}
                                          onChange={(e) => setCommentText(e.target.value)}
                                          autoFocus
                                        ></textarea>
                                      </div>
                                      <div className="flex justify-end">
                                        <div className="flex gap-2">
                                          <button 
                                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                            onClick={handleCommentClose}
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            className={`apple-button-black ${!commentText.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={handleCommentSubmit}
                                            disabled={!commentText.trim()}
                                          >
                                            Submit
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-center py-2">
                                      <div className="text-green-500 mr-2">
                                        <CheckIcon className="h-5 w-5" />
                                      </div>
                                      <p className="text-center text-gray-700 dark:text-gray-300 text-sm">
                                        Thanks for your feedback!
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Loading indicator - Apple-style typing indicator */}
          {isLoading && waitingForFirstToken && (
            <div className="flex my-6 w-full px-4 ml-3">
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} className="h-4"></div>
        </div>
      </div>
    </div>
  );
}
