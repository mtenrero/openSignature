'use client'

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getShellVariant } from '../../lib/ui/shellVariant'
import { AppLayout } from './AppLayout'
import { PublicHeader } from './PublicHeader'
import { SignerHeader } from './SignerHeader'

/** Chooses the chrome (app shell / public header / signer / kiosk) for the current route. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const { status } = useSession()
  // Read the query string after mount (useSearchParams would force a Suspense boundary).
  const [search, setSearch] = useState('')
  useEffect(() => setSearch(window.location.search), [pathname])

  const variant = getShellVariant(pathname + search, status)

  switch (variant) {
    case 'signer':
      return (
        <>
          <SignerHeader />
          <main style={{ minHeight: 'calc(100dvh - 48px - var(--os-safe-top))' }}>{children}</main>
        </>
      )
    case 'kiosk':
      return (
        <main
          style={{
            minHeight: '100dvh',
            padding: 'var(--os-safe-top) var(--os-safe-right) var(--os-safe-bottom) var(--os-safe-left)',
          }}
        >
          {children}
        </main>
      )
    case 'public':
      return (
        <>
          <PublicHeader />
          <main style={{ minHeight: 'calc(100dvh - var(--os-header-h))' }}>{children}</main>
        </>
      )
    case 'loading':
      return <AppLayout loading>{children}</AppLayout>
    default:
      return <AppLayout>{children}</AppLayout>
  }
}
