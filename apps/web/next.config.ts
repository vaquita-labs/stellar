import path from 'node:path';
import type { NextConfig } from 'next';

// End-to-end runs only: `E2E_TEST_SIGNER=1` swaps `@pollar/react` for the shim
// in `e2e/shim`, which logs the app in with a local Stellar keypair instead of
// Pollar's hosted modal. The alias is absent from the config otherwise, so a
// regular build never resolves (or bundles) anything under `e2e/`. Dev and
// build both run on Turbopack here, hence a single `turbopack.resolveAlias`.
const e2eSignerAlias: Pick<NextConfig, 'turbopack'> =
  process.env.E2E_TEST_SIGNER === '1'
    ? { turbopack: { resolveAlias: { '@pollar/react': './e2e/shim/pollar-react.tsx' } } }
    : {};

const nextConfig: NextConfig = {
  ...e2eSignerAlias,
  output: 'standalone',
  // Dev-only: Next 16 blocks requests to its internal dev assets (/_next/*,
  // HMR websocket) coming from any origin other than localhost. When the app is
  // served through Caddy at https://app.local.vaquita.fi the client chunks never
  // load, React never hydrates, and the app hangs on the loader. Allowlisting
  // the proxied host lets those dev requests through. No effect on prod builds.
  allowedDevOrigins: ['app.local.vaquita.fi'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    // Serve AVIF first (smaller than WebP for these gradient/photographic
    // icons), fall back to WebP. Next only emitted WebP before this block.
    formats: ['image/avif', 'image/webp'],
    // Keep an optimized variant on disk for a year instead of re-encoding the
    // source on nearly every request — the self-hosted optimizer has no CDN in
    // front of it, so this is the only durable cache for /_next/image output.
    minimumCacheTTL: 31536000,
  },
  // Public profiles used to hang off /leaderboard/<username>, and that is the
  // URL baked into every share link and QR handed out so far. The screen is now
  // /explore, so keep the old shape resolving instead of 404ing links that are
  // already out in the wild. 308 = permanent, method-preserving.
  async redirects() {
    return [
      {
        source: '/leaderboard/:username',
        destination: '/explore/:username',
        permanent: true,
      },
    ];
  },
  // PostHog detrás de nuestro propio dominio. `i.posthog.com` está en todas las
  // listas de bloqueo, así que sin esto una parte de los eventos desaparece sin
  // ruido y los números quedan mal de una forma que nadie puede detectar. Es lo
  // mismo que ya se hacía con Umami sirviendo el tracker desde /va.js.
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*', destination: 'https://us-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ];
  },
  // Los endpoints de PostHog terminan en barra y Next, por default, redirige
  // 308 para sacársela: el POST del evento se pierde en el camino.
  skipTrailingSlashRedirect: true,
  // @vaquita/avatar ships raw TS (exports ./src/index.ts) — transpile it too.
  transpilePackages: ['@vaquita/ui', '@vaquita/avatar'],
};

export default nextConfig;
