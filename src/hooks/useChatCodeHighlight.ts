'use client'

import { useEffect, useCallback, useState } from 'react'
import hljs from 'highlight.js'

interface CodeBlock {
  language: string
  code: string
}

interface UseChatCodeHighlightReturn {
  highlightCode: (code: string, language?: string) => string
  detectLanguage: (code: string) => string
  extractCodeBlocks: (content: string) => CodeBlock[]
  isSupported: (language: string) => boolean
  getSupportedLanguages: () => string[]
}

export function useChatCodeHighlight(): UseChatCodeHighlightReturn {
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([])

  useEffect(() => {
    // Register commonly used languages
    hljs.registerLanguage('javascript', require('highlight.js/lib/languages/javascript'))
    hljs.registerLanguage('typescript', require('highlight.js/lib/languages/typescript'))
    hljs.registerLanguage('python', require('highlight.js/lib/languages/python'))
    hljs.registerLanguage('java', require('highlight.js/lib/languages/java'))
    hljs.registerLanguage('cpp', require('highlight.js/lib/languages/cpp'))
    hljs.registerLanguage('csharp', require('highlight.js/lib/languages/csharp'))
    hljs.registerLanguage('ruby', require('highlight.js/lib/languages/ruby'))
    hljs.registerLanguage('go', require('highlight.js/lib/languages/go'))
    hljs.registerLanguage('rust', require('highlight.js/lib/languages/rust'))
    hljs.registerLanguage('swift', require('highlight.js/lib/languages/swift'))
    hljs.registerLanguage('kotlin', require('highlight.js/lib/languages/kotlin'))
    hljs.registerLanguage('php', require('highlight.js/lib/languages/php'))
    hljs.registerLanguage('html', require('highlight.js/lib/languages/xml'))
    hljs.registerLanguage('css', require('highlight.js/lib/languages/css'))
    hljs.registerLanguage('sql', require('highlight.js/lib/languages/sql'))
    hljs.registerLanguage('json', require('highlight.js/lib/languages/json'))
    hljs.registerLanguage('yaml', require('highlight.js/lib/languages/yaml'))
    hljs.registerLanguage('markdown', require('highlight.js/lib/languages/markdown'))
    hljs.registerLanguage('bash', require('highlight.js/lib/languages/bash'))
    hljs.registerLanguage('shell', require('highlight.js/lib/languages/shell'))

    setSupportedLanguages(hljs.listLanguages())
  }, [])

  const highlightCode = useCallback((code: string, language?: string) => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value
      }
      return hljs.highlightAuto(code).value
    } catch (err) {
      console.error('Failed to highlight code:', err)
      return code
    }
  }, [])

  const detectLanguage = useCallback((code: string) => {
    try {
      const result = hljs.highlightAuto(code)
      return result.language || 'plaintext'
    } catch (err) {
      console.error('Failed to detect language:', err)
      return 'plaintext'
    }
  }, [])

  const extractCodeBlocks = useCallback((content: string): CodeBlock[] => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
    const blocks: CodeBlock[] = []
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'plaintext'
      const code = match[2].trim()
      blocks.push({ language, code })
    }

    return blocks
  }, [])

  const isSupported = useCallback(
    (language: string) => {
      return supportedLanguages.includes(language)
    },
    [supportedLanguages]
  )

  const getSupportedLanguages = useCallback(() => {
    return supportedLanguages
  }, [supportedLanguages])

  return {
    highlightCode,
    detectLanguage,
    extractCodeBlocks,
    isSupported,
    getSupportedLanguages,
  }
} 