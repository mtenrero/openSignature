/**
 * Capacitor shell for oSign (scaffolding only: no native platform is generated in this repo).
 * See docs/mobile-native.md for the build steps.
 *
 * The native app is a thin WebView over the DEPLOYED Next.js app (server.url): the app needs
 * the API and server-rendered pages, so there is no static export.
 *
 * `@capacitor/cli` is intentionally not a dependency yet; the config is typed structurally so
 * this file compiles without it. When you add the CLI, you can switch to
 * `import type { CapacitorConfig } from '@capacitor/cli'`.
 */
const config = {
  // PLACEHOLDER: replace with the real reverse-DNS id registered in App Store / Play Console.
  appId: 'eu.osign.app',
  appName: 'oSign',
  // Required by Capacitor even though the UI is served from server.url.
  webDir: 'public',
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? 'https://osign.eu',
    cleartext: false,
    // Keep auth/IdP navigation inside the WebView; add IdP hosts here if you use them.
    allowNavigation: ['osign.eu', '*.osign.eu'],
  },
  ios: {
    contentInset: 'never', // the web layer handles safe areas (viewport-fit=cover + env(safe-area-inset-*))
    backgroundColor: '#f5f6f8',
  },
  android: {
    backgroundColor: '#f5f6f8',
  },
}

export default config
