/**
 * The signup page ('use client') imports lib/auth/registration.ts. If that module pulls in a
 * Node-only builtin (it once re-exported clientIp, which imports 'net'), the client bundle
 * fails with "Can't resolve 'net'" and /auth/signup answers 500.
 */
describe('registration module is client-bundle safe', () => {
  it('loads without touching node:net (no clientIp re-export)', () => {
    jest.resetModules()
    jest.doMock('net', () => { throw new Error("Can't resolve 'net' (client bundle)") })
    const mod = require('./registration')
    expect(typeof mod.validateRegistration).toBe('function')
    expect(mod.clientIp).toBeUndefined()
    jest.dontMock('net')
  })
})
