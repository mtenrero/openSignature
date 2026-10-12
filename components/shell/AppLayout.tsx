'use client'

import React from 'react'
import { AppShell } from '@mantine/core'
import { usePathname } from 'next/navigation'
import { BottomTabBar } from './BottomTabBar'
import { SideNav } from './SideNav'
import { shouldHideTabBar } from '../../lib/ui/shellVariant'
import { useKeyboardOpen } from '../../lib/ui/useKeyboardOpen'

/** Mantine AppShell: sidebar from `sm`, bottom tab bar below `sm`. No global top header. */
export function AppLayout({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  const pathname = usePathname() ?? ''
  const keyboardOpen = useKeyboardOpen()
  const hideTabBar = shouldHideTabBar(pathname) || keyboardOpen
  return (
    <AppShell
      padding={0}
      navbar={{ width: { sm: 220, lg: 260 }, breakpoint: 'sm', collapsed: { mobile: true } }}
      footer={{
        height: { base: 'calc(64px + env(safe-area-inset-bottom, 0px))', sm: 0 },
        collapsed: hideTabBar,
      }}
    >
      <AppShell.Navbar visibleFrom="sm" className="os-navbar" withBorder={false}>
        <SideNav loading={loading} />
      </AppShell.Navbar>
      <AppShell.Main className="os-main">
        <div className="os-content">{children}</div>
      </AppShell.Main>
      <AppShell.Footer hiddenFrom="sm" withBorder={false} style={{ background: 'transparent' }}>
        <BottomTabBar />
      </AppShell.Footer>
    </AppShell>
  )
}
