import type { MetadataRoute } from 'next';

// Web app manifest — makes the app installable (Add to Home Screen / install
// prompt). Next serves this at /manifest.webmanifest and links it automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Vaquita',
    short_name: 'Vaquita',
    description: 'La forma más divertida de generar ahorros con el poder de la blockchain',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fef5e4',
    theme_color: '#fef5e4',
    icons: [
      { src: '/icons/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
