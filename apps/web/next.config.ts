import { execSync } from 'node:child_process';
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
    // Cache-buster for the immutable OG/share card images: stamped with the
    // commit SHA, so a redesigned card gets a new URL on deploy without anyone
    // remembering to bump a manual version. Inlined into the client bundle at
    // build time. CI passes GIT_SHA as a Docker build arg (the build context
    // carries no .git directory); local builds read HEAD from the repo. With
    // neither available the build fails here instead of shipping an
    // unversioned bundle.
    //
    // The value must also be stable while the dev server runs: Turbopack
    // re-evaluates this config repeatedly, and a value that changes per
    // evaluation invalidates the server components and locks the client into
    // an endless HMR refetch storm. The commit SHA only moves when HEAD does.
    NEXT_PUBLIC_CARD_VERSION: (
      process.env.GIT_SHA ||
      execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    ).slice(0, 8),
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
