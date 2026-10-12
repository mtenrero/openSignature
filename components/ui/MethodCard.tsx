import React from 'react'
import { IconCircleCheckFilled } from '@tabler/icons-react'

/** Large radio card. Wrap several in <div role="radiogroup" aria-label="..."> */
export function MethodCard({
  icon,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className="os-method"
      onClick={() => !disabled && onSelect()}
    >
      <span style={{ color: 'var(--os-brand)', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{title}</span>
        {description ? <span style={{ display: 'block', fontSize: 14, color: 'var(--os-text-dim)' }}>{description}</span> : null}
      </span>
      {selected ? <IconCircleCheckFilled size={22} style={{ color: 'var(--os-brand)' }} aria-hidden="true" /> : null}
    </button>
  )
}
