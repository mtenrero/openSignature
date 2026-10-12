'use client'

import React from 'react'
import { ActionIcon } from '@mantine/core'
import { IconChevronLeft, IconDots } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { ActionMenu, type ActionSheetItem } from './ActionSheet'

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** string = fallback href when there is no history; true = fallback to /signatures */
  back?: string | true
  /** At most 2 icon buttons (use aria-label on each). */
  actions?: React.ReactNode
  overflowActions?: ActionSheetItem[]
  /** Large title below the bar on mobile (root tab pages). */
  large?: boolean
  sticky?: boolean
}

export function PageHeader({ title, subtitle, back, actions, overflowActions, large, sticky }: PageHeaderProps) {
  const router = useRouter()
  const isSticky = sticky ?? !large
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(typeof back === 'string' ? back : '/signatures')
  }
  const cls = ['os-ph', large && 'os-ph--large', isSticky && 'os-ph--sticky', back && 'os-ph--back']
    .filter(Boolean)
    .join(' ')
  return (
    <header className={cls} data-testid="page-header">
      <div className="os-ph__back">
        {back ? (
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Volver" onClick={goBack}>
            <IconChevronLeft size={24} />
          </ActionIcon>
        ) : null}
      </div>
      <div className="os-ph__titles">
        <h1 className="os-ph__title">{title}</h1>
        {subtitle ? <p className="os-ph__subtitle">{subtitle}</p> : null}
      </div>
      <div className="os-ph__actions">
        {actions}
        {overflowActions && overflowActions.length > 0 ? (
          <ActionMenu
            items={overflowActions}
            target={
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Más acciones">
                <IconDots size={22} />
              </ActionIcon>
            }
          />
        ) : null}
      </div>
    </header>
  )
}
