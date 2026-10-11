/**
 * @jest-environment jsdom
 *
 * Sign-in page: 'Entrar con VetControl' exists only when the authentik provider is enabled,
 * and /auth/signin?provider=authentik auto-starts signIn('authentik') with a SAFE callbackUrl.
 */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import SignInPage from '@/app/auth/signin/page'

let query = ''
let sessionStatus: 'unauthenticated' | 'authenticated' = 'unauthenticated'
const signInMock = jest.fn().mockResolvedValue(undefined)
const getProvidersMock = jest.fn()
const replaceMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(query),
}))
jest.mock('next-auth/react', () => ({
  signIn: (...a: any[]) => signInMock(...a),
  getProviders: () => getProvidersMock(),
  useSession: () => ({ data: sessionStatus === 'authenticated' ? { user: {} } : null, status: sessionStatus }),
}))
beforeAll(() => {
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } as any))
})
beforeEach(() => {
  signInMock.mockClear()
  replaceMock.mockClear()
  sessionStatus = 'unauthenticated'
  getProvidersMock.mockResolvedValue({ auth0: {}, authentik: {} })
})
const renderPage = () => render(<MantineProvider><SignInPage /></MantineProvider>)

describe('signin page: Entrar con VetControl', () => {
  it('shows the button when the provider is enabled and starts signIn(authentik) on click', async () => {
    query = ''
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Entrar con VetControl/ }))
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('authentik', { callbackUrl: '/contracts', redirect: true }, undefined))
  })

  it('hides the button when the provider is not enabled', async () => {
    getProvidersMock.mockResolvedValue({ auth0: {} })
    query = ''
    renderPage()
    await screen.findByRole('button', { name: /Barvet Empresas/ })
    await waitFor(() => expect(getProvidersMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Entrar con VetControl/ })).toBeNull()
  })

  it('?provider=authentik auto-starts the login once, with the validated callbackUrl', async () => {
    query = 'provider=authentik&callbackUrl=%2Fcontracts%3Fx%3D1'
    renderPage()
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    expect(signInMock).toHaveBeenCalledWith('authentik', { callbackUrl: '/contracts?x=1', redirect: true }, undefined)
  })

  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example'])('an unsafe callbackUrl (%s) falls back to /contracts', async (cb) => {
    query = `provider=authentik&callbackUrl=${encodeURIComponent(cb)}`
    renderPage()
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    expect(signInMock.mock.calls[0][1].callbackUrl).toBe('/contracts')
  })

  it('?provider=authentik does NOT auto-start when the provider is disabled', async () => {
    getProvidersMock.mockResolvedValue({ auth0: {} })
    query = 'provider=authentik'
    renderPage()
    await waitFor(() => expect(getProvidersMock).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('R1: ?provider=authentik STARTS the IdP flow even with an existing oSign session (no skip into it)', async () => {
    sessionStatus = 'authenticated'
    query = 'provider=authentik&callbackUrl=%2Fcontracts'
    renderPage()
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1))
    expect(signInMock).toHaveBeenCalledWith('authentik', { callbackUrl: '/contracts', redirect: true }, undefined)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('R1: an existing session without ?provider=authentik still redirects into it', async () => {
    sessionStatus = 'authenticated'
    query = 'callbackUrl=%2Fcontracts'
    renderPage()
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/contracts'))
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('R1: ?provider=authentik with the provider disabled and a session falls back to the normal redirect', async () => {
    sessionStatus = 'authenticated'
    getProvidersMock.mockResolvedValue({ auth0: {} })
    query = 'provider=authentik'
    renderPage()
    await waitFor(() => expect(replaceMock).toHaveBeenCalled())
    expect(signInMock).not.toHaveBeenCalled()
  })
})
