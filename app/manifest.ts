import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'oSign — Firma electrónica',
    short_name: 'oSign',
    lang: 'es',
    start_url: '/signatures',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f5f6f8',
    // Same as the light app chrome (--os-surface) and layout.tsx viewport.themeColor (light). The manifest cannot
    // express dark; the <meta name=theme-color> media variants take over there (#0e1116 = dark --os-bg).
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
