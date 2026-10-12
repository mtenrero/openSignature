'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TAB_ITEMS, getActiveTabKey } from './navItems'

export function BottomTabBar() {
  const pathname = usePathname() ?? ''
  const active = getActiveTabKey(pathname)
  return (
    <nav className="os-tabbar" aria-label="Navegación principal" data-testid="bottom-tab-bar">
      {TAB_ITEMS.map((t) => {
        const Icon = t.icon
        const isActive = active === t.key
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`os-tab${t.primary ? ' os-tab--primary' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={t.ariaLabel}
            data-testid={`tab-${t.key}`}
          >
            {t.primary ? (
              <span className="os-tab__fab">
                <Icon size={26} stroke={2.2} />
              </span>
            ) : (
              <Icon size={24} stroke={isActive ? 2.2 : 1.7} />
            )}
            <span aria-hidden={t.ariaLabel ? true : undefined}>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
