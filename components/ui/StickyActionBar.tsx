import React from 'react'

/**
 * Fixed bottom bar on mobile (primary actions in thumb reach); a sticky bar at the top of its column on >= sm.
 * `caption` is visible helper text (e.g. why the primary is disabled); wire it with aria-describedby via `captionId`.
 * `spacer={false}` lets the host put the bottom spacer itself when the bar is rendered above the content.
 */
export function StickyActionBar({
  children, aboveTabBar, caption, captionId, spacer = true,
}: { children: React.ReactNode; aboveTabBar?: boolean; caption?: React.ReactNode; captionId?: string; spacer?: boolean }) {
  return (
    <>
      {spacer ? <div className="os-sab-spacer" aria-hidden="true" /> : null}
      <div className={`os-sab${aboveTabBar ? ' os-sab--above-tabbar' : ''}`} data-testid="sticky-action-bar">
        {caption ? (
          <p className="os-sab__caption" id={captionId} data-testid="sticky-action-caption">
            {caption}
          </p>
        ) : null}
        {children}
      </div>
    </>
  )
}
