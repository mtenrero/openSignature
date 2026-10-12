import React from 'react'

/** Fixed bottom bar on mobile (primary actions in thumb reach); inline on >= sm. */
export function StickyActionBar({ children, aboveTabBar }: { children: React.ReactNode; aboveTabBar?: boolean }) {
  return (
    <>
      <div className="os-sab-spacer" aria-hidden="true" />
      <div className={`os-sab${aboveTabBar ? ' os-sab--above-tabbar' : ''}`} data-testid="sticky-action-bar">
        {children}
      </div>
    </>
  )
}
