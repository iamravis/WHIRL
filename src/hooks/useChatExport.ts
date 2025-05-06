'use client'

import { useState, useCallback } from 'react'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  createdAt: string
}

interface Chat {
  id: string
  title: string
  createdAt: string
  messages: Message[]
}

interface ExportOptions {
  format: 'json' | 'markdown' | 'txt' | 'html'
  includeMetadata: boolean
  includeTimestamps: boolean
}

interface UseChatExportReturn {
  isExporting: boolean
  error: string | null
  exportChat: (chat: Chat, options: ExportOptions) => Promise<void>
  exportAllChats: (chats: Chat[], options: ExportOptions) => Promise<void>
}

export function useChatExport(): UseChatExportReturn {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString()
  }

  const exportToJson = (chat: Chat, options: ExportOptions) => {
    const data = options.includeMetadata
      ? chat
      : {
          messages: chat.messages.map((msg) => ({
            content: msg.content,
            role: msg.role,
            ...(options.includeTimestamps && { createdAt: msg.createdAt }),
          })),
        }
    return JSON.stringify(data, null, 2)
  }

  const exportToMarkdown = (chat: Chat, options: ExportOptions) => {
    let md = ''
    if (options.includeMetadata) {
      md += `# ${chat.title}\n\n`
      md += `Created: ${formatDate(chat.createdAt)}\n\n`
    }

    chat.messages.forEach((msg) => {
      md += `**${msg.role}**`
      if (options.includeTimestamps) {
        md += ` (${formatDate(msg.createdAt)})`
      }
      md += `:\n\n${msg.content}\n\n---\n\n`
    })

    return md
  }

  const exportToTxt = (chat: Chat, options: ExportOptions) => {
    let txt = ''
    if (options.includeMetadata) {
      txt += `Title: ${chat.title}\n`
      txt += `Created: ${formatDate(chat.createdAt)}\n\n`
    }

    chat.messages.forEach((msg) => {
      txt += `[${msg.role}]`
      if (options.includeTimestamps) {
        txt += ` ${formatDate(msg.createdAt)}`
      }
      txt += `:\n${msg.content}\n\n`
    })

    return txt
  }

  const exportToHtml = (chat: Chat, options: ExportOptions) => {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    html += '<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.5}'
    html += '.message{margin-bottom:1rem;padding:1rem;border-radius:0.5rem;background:#f3f4f6}'
    html += '.user{background:#e5e7eb}.assistant{background:#f3f4f6}'
    html += '.meta{color:#6b7280;font-size:0.875rem}</style></head><body>'

    if (options.includeMetadata) {
      html += `<h1>${chat.title}</h1>`
      html += `<p class="meta">Created: ${formatDate(chat.createdAt)}</p>`
    }

    chat.messages.forEach((msg) => {
      html += `<div class="message ${msg.role}">`
      html += `<strong>${msg.role}</strong>`
      if (options.includeTimestamps) {
        html += ` <span class="meta">${formatDate(msg.createdAt)}</span>`
      }
      html += `<p>${msg.content.replace(/\n/g, '<br>')}</p></div>`
    })

    html += '</body></html>'
    return html
  }

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const exportChat = useCallback(async (chat: Chat, options: ExportOptions) => {
    try {
      setIsExporting(true)
      setError(null)

      let content: string
      let extension: string

      switch (options.format) {
        case 'json':
          content = exportToJson(chat, options)
          extension = 'json'
          break
        case 'markdown':
          content = exportToMarkdown(chat, options)
          extension = 'md'
          break
        case 'html':
          content = exportToHtml(chat, options)
          extension = 'html'
          break
        default:
          content = exportToTxt(chat, options)
          extension = 'txt'
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `chat-${chat.id}-${timestamp}.${extension}`
      downloadFile(content, filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export chat')
    } finally {
      setIsExporting(false)
    }
  }, [])

  const exportAllChats = useCallback(async (chats: Chat[], options: ExportOptions) => {
    try {
      setIsExporting(true)
      setError(null)

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `all-chats-${timestamp}.${options.format}`

      let content: string
      switch (options.format) {
        case 'json':
          content = JSON.stringify(
            chats.map((chat) => JSON.parse(exportToJson(chat, options))),
            null,
            2
          )
          break
        case 'markdown':
          content = chats.map((chat) => exportToMarkdown(chat, options)).join('\n\n')
          break
        case 'html':
          content =
            '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:0 1rem}' +
            '.chat{margin-bottom:3rem;padding:1rem;border:1px solid #e5e7eb;border-radius:0.5rem}' +
            '.message{margin-bottom:1rem;padding:1rem;border-radius:0.5rem;background:#f3f4f6}' +
            '.user{background:#e5e7eb}.assistant{background:#f3f4f6}' +
            '.meta{color:#6b7280;font-size:0.875rem}</style></head><body>' +
            chats.map((chat) => `<div class="chat">${exportToHtml(chat, options)}</div>`).join('') +
            '</body></html>'
          break
        default:
          content = chats.map((chat) => exportToTxt(chat, options)).join('\n\n' + '='.repeat(80) + '\n\n')
      }

      downloadFile(content, filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export chats')
    } finally {
      setIsExporting(false)
    }
  }, [])

  return {
    isExporting,
    error,
    exportChat,
    exportAllChats,
  }
} 