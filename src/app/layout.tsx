import './globals.css'
import type { Metadata } from 'next'
import Providers from './providers'
import 'katex/dist/katex.min.css'
import { ThemeProvider } from 'next-themes'

export const metadata: Metadata = {
  title: 'WHIRL Chat',
  description: 'Chat with WHIRL AI',
  icons: {
    icon: [
      { url: '/logo_.png', sizes: '16x16', type: 'image/png' },
      { url: '/logo_.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo_.png', sizes: 'any', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  )
} 