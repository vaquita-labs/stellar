import { z } from 'zod';

// SERVER-ONLY env (no NEXT_PUBLIC_ prefix): never import from client components.
// All required — an empty value is a deploy error, not a way to disable
// authentication.
const envServerSchema = z.object({
  // Soroban RPC endpoints, one per network. The contract-events scan picks one
  // by the Config network passphrase, so neither can silently fall back to a
  // public endpoint of the wrong network.
  STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
  // Pooled Postgres connection used by the server-side admin routes via the
  // shared @vaquita/db Prisma client.
  DATABASE_URL: z.string().min(1),
  // Gate of the local admin API routes: requests must echo it in the
  // `x-admin-secret` header. Same value as the API's ADMIN_SECRET.
  ADMIN_SECRET: z.string().min(16, 'ADMIN_SECRET is required (min 16 chars) — admin routes are never open'),
  // Passcode that gates EVERY admin route (enforced by src/middleware.ts).
  ADMIN_PASSCODE: z.string().min(8, 'ADMIN_PASSCODE is required (min 8 chars) — the login gate is never open'),
});

type ServerEnv = z.infer<typeof envServerSchema>;

let cached: ServerEnv | null = null;

/**
 * Zod-validated server env. Lazy (validated on first access, not at import) so
 * `next build` does not need runtime secrets; a misconfigured deploy fails on
 * the first request with the zod detail.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = envServerSchema.safeParse({
    STELLAR_MAINNET_SOROBAN_RPC_URL: process.env.STELLAR_MAINNET_SOROBAN_RPC_URL,
    STELLAR_TESTNET_SOROBAN_RPC_URL: process.env.STELLAR_TESTNET_SOROBAN_RPC_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_SECRET: process.env.ADMIN_SECRET,
    ADMIN_PASSCODE: process.env.ADMIN_PASSCODE,
  });

  if (!parsed.success) {
    console.error('❌ Error en configuración de variables de entorno:');
    console.error(parsed.error.format());
    throw new Error('Variables de entorno inválidas');
  }

  cached = parsed.data;
  return cached;
}
