import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // @vaquita/db, @vaquita/shared and @vaquita/ui ship raw TS/TSX (exports
  // ./src/index.ts), so Next must transpile them for the admin app to import
  // them.
  //
  // RULE, and the build breaks loudly when it is broken: never import the
  // @vaquita/shared ROOT barrel from this app — always a subpath
  // (@vaquita/shared/services/<name>/index), and never a runtime *value* from
  // any part of it inside a client component. Because the package is
  // transpiled, a root-barrel import makes Turbopack compile the whole barrel
  // for whichever environment the importer lives in: the barrel re-exports
  // `prisma` and web-push, so a client component importing one constant from it
  // fails the build on `dns`/`net`/`tls`/`node:module`. Client-side constants
  // are mirrored locally instead (see core-ui/hooks/useFeedback.ts).
  transpilePackages: ['@vaquita/db', '@vaquita/shared', '@vaquita/ui'],
};

export default nextConfig;
