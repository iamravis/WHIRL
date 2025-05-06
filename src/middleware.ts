import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Get the pathname
  const path = request.nextUrl.pathname
  
  // Define public paths that don't require authentication
  const isPublicPath = 
    path === '/auth/signin' || 
    path === '/auth/signup' || 
    path.startsWith('/api/auth/')
  
  // Get the token from session storage
  const token = request.cookies.get('access_token')?.value || ''
  
  // Redirect unauthenticated users to login
  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }
  
  // Allow access to auth pages only for unauthenticated users
  if (isPublicPath && token) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/auth/signin',
    '/auth/signup',
    '/api/chat/:path*',
    '/api/gemma/:path*',
    '/chat/:path*',
    '/api/chats/:path*',
  ],
} 