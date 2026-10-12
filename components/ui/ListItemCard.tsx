'use client'

import React from 'react'
import Link from 'next/link'
import { IconChevronRight } from '@tabler/icons-react'

export interface ListItemCardProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  meta?: React.ReactNode[]
  status?: React.ReactNode
  leading?: React.ReactNode
  href?: string
  onClick?: () => void
  /** Usually an ActionMenu; rendered as a separate 44px target. */
  trailing?: React.ReactNode
  testId?: string
}

/** The whole row is ONE link/button (>= 64px). The trailing overflow control is a separate target. */
export function ListItemCard({ title, subtitle, meta, status, leading, href, onClick, trailing, testId }: ListItemCardProps) {
  const inner = (
    <>
      {leading}
      <span className="os-li__body">
        <span className="os-li__title">{title}</span>
        {subtitle ? <span className="os-li__sub">{subtitle}</span> : null}
        {meta && meta.length > 0 ? (
          <span className="os-li__meta">
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </span>
        ) : null}
      </span>
      {status}
      {(href || onClick) && <IconChevronRight size={18} className="os-li__chev" aria-hidden="true" />}
    </>
  )
  return (
    <div className="os-li" data-testid={testId}>
      {href ? (
        <Link href={href} className="os-li__main">
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" className="os-li__main" onClick={onClick}>
          {inner}
        </button>
      ) : (
        <div className="os-li__main" style={{ cursor: 'default' }}>
          {inner}
        </div>
      )}
      {trailing ? (
        <div className="os-li__trailing" onClick={(e) => e.stopPropagation()}>
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
