import '../styles/globals.css'
import React from 'react'
import { ColorSchemeScript } from '@mantine/core'
import { MantineProvider } from '../components/MantineProvider'
import { Header } from '../components/Header'
import { SessionProvider } from 'next-auth/react'

export const metadata = {
  title: 'oSign.eu',
  description: 'Digital signature platform',
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
        <ColorSchemeScript />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body suppressHydrationWarning>
        <MantineProvider>
          <AuthProvider>
            <Header />
            <main style={{ minHeight: 'calc(100vh - 60px)' }}>
              {children}
            </main>
          </AuthProvider>
        </MantineProvider>
      </body>
    </html>
  )
}