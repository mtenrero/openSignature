import '../styles/globals.css'
import React from 'react'
import { ColorSchemeScript } from '@mantine/core'
import type { Metadata, Viewport } from 'next'
import { MantineProvider } from '../components/MantineProvider'
import { AppFrame } from '../components/shell/AppFrame'
import { SessionProvider } from 'next-auth/react'

export const metadata: Metadata = {
  title: 'oSign.eu',
  description: 'Digital signature platform',
  applicationName: 'oSign',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'oSign', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1116' },
  ],
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  // console.log('[AUTH PROVIDER] Initializing SessionProvider...')
  
  return (
    <SessionProvider 
      // Refetch session every 10 minutes to avoid excessive API calls
      refetchInterval={10 * 60}
      // Refetch session when window regains focus
      refetchOnWindowFocus={true}
      // Don't refetch when offline
      refetchWhenOffline={false}
    >
      {children}
    </SessionProvider>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body suppressHydrationWarning>
        <MantineProvider>
          <AuthProvider>
            <AppFrame>{children}</AppFrame>
          </AuthProvider>
        </MantineProvider>
      </body>
    </html>
  )
}