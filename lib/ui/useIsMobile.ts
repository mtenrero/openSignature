'use client'
import { useMediaQuery } from '@mantine/hooks'

/** True below Mantine's `sm` breakpoint (48em). Prefer CSS props (hiddenFrom/visibleFrom) when possible. */
export function useIsMobile(): boolean {
  return !!useMediaQuery('(max-width: 47.99em)', false, { getInitialValueInEffect: true })
}
