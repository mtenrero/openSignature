/**
 * @jest-environment jsdom
 *
 * Reproduces Bug #1: the "data" (Datos) step is shown to the signer even when
 * the partner pre-filled all required fields via API.
 *
 * Root cause: `initialSteps` is a `useState(initializer)` that runs once on
 * mount, reading `dynamicFieldValues` BEFORE the useEffect that pre-fills it.
 * The initializer always sees an empty `{}` and includes the data step.
 *
 * Expected (post-fix): when `signData.signRequest.dynamicFieldValues` contains
 * values for every required field, the signer lands directly on the review step.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { SignDataContext } from '@/app/sign/[shortId]/layout'
import SignDocument from '@/app/sign/[shortId]/page'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useParams: () => ({ shortId: 'TEST123' }),
  useSearchParams: () => new URLSearchParams('a=abcdef'),
}))

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ put: jest.fn(), post: jest.fn() }), post: jest.fn(), put: jest.fn(), get: jest.fn() },
  create: () => ({ put: jest.fn(), post: jest.fn() }),
}))
jest.mock('axios-retry', () => ({ __esModule: true, default: jest.fn() }))

const buildSignData = (overrides: Record<string, unknown> = {}) => ({
  contract: {
    name: 'Contrato de prueba',
    content:
      '<p>Yo {{dynamic:clientName}} con NIF {{dynamic:clientTaxId}} contrato.</p>',
    userFields: [
      { id: '1', name: 'clientName', type: 'name', required: true, label: 'Nombre' },
      { id: '2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF' },
    ],
    parameters: {},
  },
  signRequest: {
    signerName: 'Ada Lovelace',
    signerEmail: null,
    signerPhone: null,
    dynamicFieldValues: {
      clientName: 'Ada Lovelace',
      clientTaxId: '12345678A',
    },
    status: 'pending',
    signatureType: 'email',
  },
  accountVariableValues: {},
  ...overrides,
})

const renderSigner = (signData: unknown) =>
  render(
    <MantineProvider>
      <SignDataContext.Provider value={{ signData, shortId: 'TEST123', accessKey: 'abcdef' }}>
        <SignDocument />
      </SignDataContext.Provider>
    </MantineProvider>
  )

describe('SignDocument step resolution', () => {
  it('REGRESSION (Bug #1): does NOT render the data form when all required fields are pre-filled via API', () => {
    renderSigner(buildSignData())

    // The DynamicFieldsForm renders a heading "Completa tu información".
    // When pre-filled data should let us skip directly to review, that heading
    // must NOT be present. Currently fails: initialSteps is computed before
    // the pre-fill useEffect runs, so the data step is always included on mount.
    expect(
      screen.queryByRole('heading', { name: /Completa tu información/i })
    ).not.toBeInTheDocument()

    // The review step renders the contract name as a heading.
    expect(
      screen.getByRole('heading', { name: /Contrato de prueba/i })
    ).toBeInTheDocument()
  })

  it('renders the data form when no fields are pre-filled', () => {
    const signData = buildSignData({
      signRequest: {
        signerName: null,
        signerEmail: null,
        signerPhone: null,
        dynamicFieldValues: null,
        status: 'pending',
        signatureType: 'email',
      },
    })
    renderSigner(signData)
    expect(
      screen.getByRole('heading', { name: /Completa tu información/i })
    ).toBeInTheDocument()
  })
})
