import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { theme } from '../../lib/theme'

export const MOBILE_QUERY = '(max-width: 47.99em)'

/** Force window.matchMedia: queries equal to MOBILE_QUERY match iff `mobile`. */
export function setMobile(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
      matches: mobile && query === MOBILE_QUERY,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia
}

export function renderWithMantine(ui: React.ReactElement, options?: RenderOptions) {
  return render(
    <MantineProvider theme={theme} env="test">
      {ui}
    </MantineProvider>,
    options
  )
}
