'use client'

import { MantineProvider as OriginalMantineProvider, ColorSchemeScript } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { theme } from '../lib/theme'
import { useIsMobile } from '../lib/ui/useIsMobile'

interface MantineProviderProps {
  children: React.ReactNode
}

export function MantineProvider({ children }: MantineProviderProps) {
  const isMobile = useIsMobile()
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <OriginalMantineProvider theme={theme} defaultColorScheme="auto">
        <Notifications
          position={isMobile ? 'top-center' : 'bottom-right'}
          zIndex={1000}
          limit={3}
          style={{ marginTop: 'var(--os-safe-top)' }}
        />
        {children}
      </OriginalMantineProvider>
    </>
  )
}
