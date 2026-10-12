import React from 'react'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="var(--mantine-color-primary-7)" />
      <path
        d="M120 330c40-8 62-120 96-120 40 0 0 150 40 150 34 0 44-86 82-86 22 0 20 40 54 40"
        fill="none"
        stroke="#fff"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({ size = 28, label = 'oSign.eu' }: { size?: number; label?: string }) {
  return (
    <span className="os-brand">
      <LogoMark size={size} />
      <span>{label}</span>
    </span>
  )
}
