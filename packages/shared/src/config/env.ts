import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Pooled Postgres connection used by the Prisma driver adapter (@vaquita/db).
  DATABASE_URL: z.string().min(1),
  // Soroban RPC endpoints, one per network. Both are always required so every
  // caller picks the endpoint by network explicitly — there is no single
  // override var and no fallback to public endpoints.
  STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
});

// NOTE: API-service-only secrets (AUTH_SESSION_SECRET, BADGE_SIGNING_SEED) are
// intentionally NOT validated here. This schema is the shared base; the
// bridge-worker deploy runs from a separate image + env and must not be forced
// to carry API secrets it never uses. Those live in apps/api/src/config/env.ts,
// loaded only by the API entrypoint.

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  process.exit(1); // Detener la app si hay error
}

export const env = parsed.data;
