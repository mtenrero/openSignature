'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getShellVariant } from '../../lib/ui/shellVariant'
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
      <Frame variant={variant}>{children}</Frame>
    </>
  )
}

function Frame({ variant, children }: { variant: ReturnType<typeof getShellVariant>; children: React.ReactNode }) {
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
