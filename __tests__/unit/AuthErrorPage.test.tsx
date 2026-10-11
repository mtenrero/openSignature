/**
 * @jest-environment jsdom
 *
 * F3: an unverified new registration lands on a clear "verifica tu email" page.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import AuthErrorPage from '@/app/auth/error/page'

let query = 'error=EmailNotVerified'
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}))
beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as any))
})
const renderPage = () => render(<MantineProvider><AuthErrorPage /></MantineProvider>)

describe('/auth/error', () => {
  it('EmailNotVerified shows the verify-your-email message', () => {
    query = 'error=EmailNotVerified'
    renderPage()
    expect(screen.getByText(/Verifica tu email/i)).toBeTruthy()
  })
  it('other errors keep the generic message', () => {
    query = 'error=Other'
    renderPage()
    expect(screen.queryByText(/Verifica tu email/i)).toBeNull()
    expect(screen.getByText(/Ha ocurrido un error/i)).toBeTruthy()
  })
})
