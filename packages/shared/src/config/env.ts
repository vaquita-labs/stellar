import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Every env the shared services read goes through here: code never reads
// process.env directly, always `env`. All are required — the process (API and
// bridge-worker) exits at startup if one is missing, instead of degrading
// silently at runtime.
const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Pooled Postgres connection used by the Prisma driver adapter (@vaquita/db).
  DATABASE_URL: z.string().min(1),
  // Soroban RPC endpoints, one per network. Every caller picks the endpoint by
  // network explicitly — there is no single override var and no fallback to
  // public endpoints.
  STELLAR_MAINNET_SOROBAN_RPC_URL: z.url(),
  STELLAR_TESTNET_SOROBAN_RPC_URL: z.url(),
  // Realtime (Ably) FULL key (appId.keyId:secret). Server-only: the web/admin
  // clients request short-lived tokens instead.
  ABLY_KEY: z.string().min(1),
  // Ed25519 seed the API signs badge-mint vouchers with (64 hex chars = 32
  // bytes). The whole badge mint flow depends on it.
  // Generate: openssl rand -hex 32
  BADGE_SIGNING_SEED: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'BADGE_SIGNING_SEED must be 64 hex chars (32 bytes)'),
  // Stellar mainnet launch (Unix ms). Opens the 7-day D2 "Mainnet Pioneer"
  // claim window (see badges/claims.ts).
  MAINNET_LAUNCH_TIMESTAMP: z.string().regex(/^\d+$/).transform(Number),
  // DeFindex API (protocol APY in stellar/apy.ts).
  DEFINDEX_API_HOST: z.url(),
  DEFINDEX_API_KEY: z.string().min(1),
  // Circle Iris (CCTP attestations), one endpoint per environment; picked by
  // the transfer's source-network environment.
  CIRCLE_CCTP_IRIS_MAINNET_BASE_URL: z.url(),
  CIRCLE_CCTP_IRIS_TESTNET_BASE_URL: z.url(),
  // Stellar relayer that submits permissionless CCTP `mint_and_forward`
  // destination transactions (bridge worker).
  BRIDGE_STELLAR_RELAYER_SECRET: z.string().min(1),
  BRIDGE_STELLAR_RELAYER_FEE_STROOPS: z.string().regex(/^\d+$/),
  BRIDGE_STELLAR_RELAYER_TIMEOUT_SECONDS: z.string().regex(/^\d+$/).transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  process.exit(1); // Detener la app si hay error
}

export const env = parsed.data;
