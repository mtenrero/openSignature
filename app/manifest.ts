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
    theme_color: '#0058e6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
