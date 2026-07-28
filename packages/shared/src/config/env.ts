import dotenv from 'dotenv';
import { z } from 'zod';

// .env.local takes precedence over .env, matching the Next.js apps.
dotenv.config({ path: ['.env.local', '.env'] });

// Base env shared by every backend service (API service and bridge-worker).
// Code never reads process.env directly, always `env`. All required — the
// process exits at startup if one is missing, instead of degrading silently
// at runtime. Service-specific groups live in their own modules
// (apiServicesEnv, bridgeEnv, relayerEnv) so each deploy only requires what
// it actually reads.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Pooled Postgres connection used by the Prisma driver adapter (@vaquita/db).
  DATABASE_URL: z.string().min(1),
  // Soroban RPC endpoints, one per network. Every caller picks the endpoint by
  // network explicitly — there is no single override var and no fallback to
  // public endpoints.
  STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
