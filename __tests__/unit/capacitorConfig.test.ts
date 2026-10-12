import fs from 'fs'
import path from 'path'
import config from '../../capacitor.config'

describe('capacitor.config.ts', () => {
  it('points the WebView at an https deployed URL, no cleartext', () => {
    expect(new URL(config.server.url).protocol).toBe('https:')
    expect(config.server.cleartext).toBe(false)
    expect(config.android.allowMixedContent).toBe(false)
  })

  it('keeps the appId placeholder in reverse-DNS form', () => {
    expect(config.appId).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/)
    expect(config.appId).toBe('eu.osign.app')
  })

  it('has an existing webDir with the offline fallback', () => {
    const dir = path.join(process.cwd(), config.webDir)
    expect(fs.existsSync(path.join(dir, 'index.html'))).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toMatch(/Sin conexi/)
  })

  it('only allows navigation inside osign.eu', () => {
    expect(config.server.allowNavigation.length).toBeGreaterThan(0)
    for (const host of config.server.allowNavigation) expect(host).toMatch(/^(\*\.)?osign\.eu$/)
    expect(new URL(config.server.url).hostname).toMatch(/(^|\.)osign\.eu$/)
  })

  it('limits iOS navigation to app-bound domains and hides the splash immediately', () => {
    expect(config.ios.limitsNavigationsToAppBoundDomains).toBe(true)
    expect(config.plugins.SplashScreen.launchShowDuration).toBe(0)
  })

  it('does not generate native platforms or add capacitor runtime deps', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'ios'))).toBe(false)
    expect(fs.existsSync(path.join(process.cwd(), 'android'))).toBe(false)
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(all.filter((d) => d.startsWith('@capacitor/'))).toEqual([])
  })
})
