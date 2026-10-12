import { shareOrCopy } from './share'

const setNav = (v: unknown) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true })
const orig = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
afterEach(() => {
  if (orig) Object.defineProperty(globalThis, 'navigator', orig)
  else delete (globalThis as { navigator?: unknown }).navigator
})

describe('shareOrCopy', () => {
  it('uses navigator.share', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNav({ share })
    expect(await shareOrCopy('https://x', 't')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ url: 'https://x', title: 't' })
  })
  it('falls back to clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNav({ clipboard: { writeText } })
    expect(await shareOrCopy('https://x')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x')
  })
  it('falls back to clipboard when share throws a non-abort error', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    setNav({ share: jest.fn().mockRejectedValue(new Error('x')), clipboard: { writeText } })
    expect(await shareOrCopy('u')).toBe('copied')
  })
  it('fails when nothing works', async () => {
    setNav({})
    expect(await shareOrCopy('u')).toBe('failed')
    setNav({ clipboard: { writeText: jest.fn().mockRejectedValue(new Error('no')) } })
    expect(await shareOrCopy('u')).toBe('failed')
  })
  it('abort of the share sheet is not a copy', async () => {
    const err = Object.assign(new Error('a'), { name: 'AbortError' })
    setNav({ share: jest.fn().mockRejectedValue(err), clipboard: { writeText: jest.fn() } })
    expect(await shareOrCopy('u')).toBe('failed')
  })
})
