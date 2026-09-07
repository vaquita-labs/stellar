import { z } from 'zod';
import './env';

// Env of the shared services only the API service loads (Ably realtime, badge
// signing/claims, APY, bridge). Validated at import of the modules that read
// it, so a deploy only requires the values it actually uses.
const apiServicesEnvSchema = z.object({
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
  // OpenAI moderation (services/moderation). Optional on purpose: this schema
  // exits the process when it fails, and an environment without the key should
  // degrade to "every report waits for a human", not take the API down.
  OPENAI_API_KEY: z.string().min(1).optional(),
  // NEAR Intents 1Click — the cross-chain bridge (services/oneclick).
  NEAR_1CLICK_BASE_URL: z.url().default('https://1click.chaindefuser.com'),
  // Optional on purpose: 1Click answers quotes, status and deposit submission
  // without a token. The JWT only raises rate limits and attributes referrals,
  // so a missing one must not exit the process and take the API down with it.
  NEAR_1CLICK_JWT: z.string().min(1).optional(),
});

const parsed = apiServicesEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const apiServicesEnv = parsed.data;
