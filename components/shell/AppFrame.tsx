'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getShellVariant, isEmbedded } from '../../lib/ui/shellVariant'
import { AppLayout } from './AppLayout'
import { PublicHeader } from './PublicHeader'
import { SignerHeader } from './SignerHeader'

/** Mirrors the query string into state. Isolated in its own Suspense boundary (useSearchParams opts out of static rendering). */
function SearchSync({ onChange }: { onChange: (search: string) => void }) {
  const params = useSearchParams()
  const value = params?.toString() ?? ''
  useEffect(() => onChange(value ? `?${value}` : ''), [value, onChange])
  return null
}

/** Chooses the chrome (app shell / public header / signer / kiosk) for the current route. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const { status } = useSession()
  // Query string (e.g. /tablet?kiosk=1) tracked through client-side navigations too, not only on mount.
  const [search, setSearch] = useState('')
  useEffect(() => setSearch(window.location.search), [pathname])

  const variant = getShellVariant(pathname + search, status)
  return (
    <>
      <Suspense fallback={null}>
        <SearchSync onChange={setSearch} />
      </Suspense>
      <Frame variant={variant} embedded={isEmbedded(search)}>{children}</Frame>
    </>
  )
}

function Frame({ variant, embedded, children }: { variant: ReturnType<typeof getShellVariant>; embedded: boolean; children: React.ReactNode }) {
  switch (variant) {
    case 'signer':
      // Inside the kiosk iframe (?embed=1) the kiosk bar already carries the brand: no second header.
      if (embedded) return <main style={{ minHeight: '100dvh' }}>{children}</main>
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
            // Safe areas are applied by the kiosk bars/main themselves (styles/signer.css).
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
