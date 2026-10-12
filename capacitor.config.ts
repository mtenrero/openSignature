/**
 * Capacitor shell for oSign (scaffolding only: no native platform is generated in this repo).
 * Build steps and caveats: docs/mobile/native-app.md
 *
 * The native app is a thin WebView over the DEPLOYED Next.js app (server.url): the app needs the
 * API and server-rendered pages, so there is no static export. `webDir` only holds the offline
 * fallback page that Capacitor needs to exist.
 *
 * The type is local on purpose: `@capacitor/cli` is not a dependency, so this file compiles
 * without any @capacitor package. After installing the CLI you can switch to
 * `import type { CapacitorConfig } from '@capacitor/cli'` (the shape below is a subset of it).
 */
export interface OsignCapacitorConfig {
  appId: string
  appName: string
  webDir: string
  server: { url: string; cleartext: boolean; allowNavigation: string[] }
  ios: { contentInset: 'never' | 'always' | 'automatic' | 'scrollableAxes'; limitsNavigationsToAppBoundDomains: boolean; backgroundColor?: string }
  android: { allowMixedContent: boolean; backgroundColor?: string }
  plugins: { SplashScreen: { launchShowDuration: number } }
}

const config: OsignCapacitorConfig = {
  // PLACEHOLDER: replace with the reverse-DNS id registered in App Store Connect / Play Console.
  appId: 'eu.osign.app',
  appName: 'oSign',
  webDir: 'capacitor-www',
  server: {
    // Always the deployed app (staging or production), never a local server with real credentials.
    url: process.env.CAP_SERVER_URL ?? 'https://osign.eu/signatures',
    cleartext: false,
    // Keep first-party navigation inside the WebView. IdP hosts are NOT listed on purpose: see the
    // login caveat in docs/mobile/native-app.md.
    allowNavigation: ['osign.eu', '*.osign.eu'],
  },
  ios: {
    contentInset: 'never', // the web layer handles safe areas (viewport-fit=cover + env(safe-area-inset-*))
    limitsNavigationsToAppBoundDomains: true,
    backgroundColor: '#f5f6f8',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f5f6f8',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 0 },
  },
}

export default config
