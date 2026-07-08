import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  // Allow API routes and public assets to bypass auth
  const pathname = req.nextUrl.pathname

  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // For other routes, let the app handle auth via the (app) layout
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
