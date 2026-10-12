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
