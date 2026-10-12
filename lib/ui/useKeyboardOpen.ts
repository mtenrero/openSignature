'use client'
import { useEffect, useState } from 'react'

/** True when the soft keyboard is likely open (visualViewport shrinks below 75% of innerHeight). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const update = () => setOpen(vv.height < window.innerHeight * 0.75)
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])
  return open
}

/**
 * Soft-keyboard geometry from visualViewport: `inset` is how many CSS px of the layout viewport
 * the keyboard covers at the bottom (iOS keeps the layout viewport tall, so a `position: fixed; bottom: 0`
 * bar would hide behind it; offsetting by `inset` keeps it just above the keyboard).
 */
export function useKeyboardInset(): { open: boolean; inset: number } {
  const [state, setState] = useState({ open: false, inset: 0 })
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const update = () => {
      const open = vv.height < window.innerHeight * 0.75
      const inset = open ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0
      setState((s) => (s.open === open && s.inset === inset ? s : { open, inset }))
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return state
}
