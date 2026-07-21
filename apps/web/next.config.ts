import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Dev-only: Next 16 blocks requests to its internal dev assets (/_next/*,
  // HMR websocket) coming from any origin other than localhost. When the app is
  // served through Caddy at https://app.local.vaquita.fi the client chunks never
  // load, React never hydrates, and the app hangs on the loader. Allowlisting
  // the proxied host lets those dev requests through. No effect on prod builds.
  allowedDevOrigins: ['app.local.vaquita.fi'],
  env: {
    // Cache-buster for the immutable OG/share card images: every `next build`
    // stamps a fresh value (or the commit SHA when CI provides one), so a
    // redesigned card gets a new URL on deploy without anyone remembering to
    // bump a manual version. Inlined into the client bundle at build time.
    //
    // In dev it MUST be constant: Turbopack re-evaluates this config while the
    // server runs, so a `Date.now()` here changes the inlined env on every
    // evaluation, which invalidates the server components, which pushes a
    // `serverComponentChanges` frame over the HMR socket, which makes the client
    // refetch the RSC payload — and that request re-evaluates the config again.
    // The result is an endless GET /<route> storm in the dev log.
    NEXT_PUBLIC_CARD_VERSION:
      process.env.GIT_SHA?.slice(0, 8) ??
      (process.env.NODE_ENV === 'development' ? 'dev' : Date.now().toString(36)),
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
  // @vaquita/avatar ships raw TS (exports ./src/index.ts) — transpile it too.
  transpilePackages: ['@vaquita/ui', '@vaquita/avatar'],
};

export default nextConfig;
