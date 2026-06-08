import '@testing-library/jest-dom'

// Polyfills for jsdom that aren't present by default
import { TextEncoder, TextDecoder } from 'util'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (global as any).TextEncoder === 'undefined') (global as any).TextEncoder = TextEncoder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (global as any).TextDecoder === 'undefined') (global as any).TextDecoder = TextDecoder

// matchMedia is consumed by some Mantine internals
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
})

// ResizeObserver / IntersectionObserver stubs for Mantine
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
class IntersectionObserverStub {
  observe() {} unobserve() {} disconnect() {}
  takeRecords() { return [] }
  root = null; rootMargin = ''; thresholds = []
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).ResizeObserver = (global as any).ResizeObserver || ResizeObserverStub
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(global as any).IntersectionObserver = (global as any).IntersectionObserver || IntersectionObserverStub
