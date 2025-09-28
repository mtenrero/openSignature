'use client'

import { MantineProvider as OriginalMantineProvider, ColorSchemeScript } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { theme } from '../lib/theme'

interface MantineProviderProps {
  children: React.ReactNode
}

export function MantineProvider({ children }: MantineProviderProps) {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="light" />
      <OriginalMantineProvider theme={theme} defaultColorScheme="light">
        <Notifications />
        {children}
      </OriginalMantineProvider>
    </>
  )
}
