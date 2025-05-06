'use client'

import { useCallback, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useChatCodeHighlight } from './useChatCodeHighlight'

interface UseChatMarkdownReturn {
  renderMarkdown: (content: string) => string
  renderInlineMarkdown: (content: string) => string
  stripMarkdown: (content: string) => string
  extractLinks: (content: string) => string[]
  extractImages: (content: string) => string[]
}

export function useChatMarkdown(): UseChatMarkdownReturn {
  const { highlightCode, detectLanguage } = useChatCodeHighlight()

  // Configure marked options
  const markedOptions = useMemo(
    () => ({
      gfm: true,
      breaks: true,
      highlight: (code: string, lang: string) => {
        const language = lang || detectLanguage(code)
        return highlightCode(code, language)
      },
    }),
    [highlightCode, detectLanguage]
  )

  // Configure DOMPurify options
  const purifyOptions = useMemo(
    () => ({
      ALLOWED_TAGS: [
        'a',
        'b',
        'blockquote',
        'br',
        'code',
        'div',
        'em',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'hr',
        'i',
        'img',
        'li',
        'ol',
        'p',
        'pre',
        'span',
        'strong',
        'table',
        'tbody',
        'td',
        'th',
        'thead',
        'tr',
        'ul',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target'],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target'],
      transformTags: {
        a: (tagName: string, attribs: any) => ({
          tagName,
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        }),
      },
    }),
    []
  )

  const renderMarkdown = useCallback(
    (content: string) => {
      try {
        const html = marked(content, markedOptions)
        return DOMPurify.sanitize(html, purifyOptions)
      } catch (err) {
        console.error('Failed to render markdown:', err)
        return content
      }
    },
    [markedOptions, purifyOptions]
  )

  const renderInlineMarkdown = useCallback(
    (content: string) => {
      try {
        const html = marked.parseInline(content, markedOptions)
        return DOMPurify.sanitize(html, purifyOptions)
      } catch (err) {
        console.error('Failed to render inline markdown:', err)
        return content
      }
    },
    [markedOptions, purifyOptions]
  )

  const stripMarkdown = useCallback((content: string) => {
    try {
      // Remove code blocks
      let stripped = content.replace(/```[\s\S]*?```/g, '')

      // Remove inline code
      stripped = stripped.replace(/`[^`]*`/g, '')

      // Remove headers
      stripped = stripped.replace(/#{1,6}\s+/g, '')

      // Remove emphasis
      stripped = stripped.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')

      // Remove links
      stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

      // Remove images
      stripped = stripped.replace(/!\[([^\]]+)\]\([^)]+\)/g, '$1')

      // Remove blockquotes
      stripped = stripped.replace(/^\s*>\s+/gm, '')

      // Remove lists
      stripped = stripped.replace(/^\s*[-*+]\s+/gm, '')
      stripped = stripped.replace(/^\s*\d+\.\s+/gm, '')

      return stripped.trim()
    } catch (err) {
      console.error('Failed to strip markdown:', err)
      return content
    }
  }, [])

  const extractLinks = useCallback((content: string) => {
    try {
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
      const links: string[] = []
      let match

      while ((match = linkRegex.exec(content)) !== null) {
        links.push(match[2])
      }

      return links
    } catch (err) {
      console.error('Failed to extract links:', err)
      return []
    }
  }, [])

  const extractImages = useCallback((content: string) => {
    try {
      const imageRegex = /!\[([^\]]+)\]\(([^)]+)\)/g
      const images: string[] = []
      let match

      while ((match = imageRegex.exec(content)) !== null) {
        images.push(match[2])
      }

      return images
    } catch (err) {
      console.error('Failed to extract images:', err)
      return []
    }
  }, [])

  return {
    renderMarkdown,
    renderInlineMarkdown,
    stripMarkdown,
    extractLinks,
    extractImages,
  }
} 