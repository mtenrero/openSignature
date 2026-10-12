import React from 'react'

export interface StatTile {
  label: string
  value: React.ReactNode
  color?: string
  onClick?: () => void
  active?: boolean
}

/** Compact 3-column tiles; clickable ones double as filter shortcuts. */
export function StatTiles({ items }: { items: StatTile[] }) {
  return (
    <div className="os-tiles" data-testid="stat-tiles">
      {items.map((it) => {
        const content = (
          <>
            <span className="os-tile__value" style={it.color ? { color: `var(--mantine-color-${it.color}-light-color)` } : undefined}>
              {it.value}
            </span>
            <span className="os-tile__label">{it.label}</span>
          </>
        )
        return it.onClick ? (
          <button key={it.label} type="button" className="os-tile" aria-pressed={!!it.active} onClick={it.onClick}>
            {content}
          </button>
        ) : (
          <div key={it.label} className="os-tile">
            {content}
          </div>
        )
      })}
    </div>
  )
}
