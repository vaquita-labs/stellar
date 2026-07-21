import { z } from 'zod';

/**
 * API-service-only environment validation.
 *
 * These secrets are required by the API service but NOT by the bridge-worker
 * deploy — the worker runs from a separate image + env and never imports this
 * module (it only pulls `@vaquita/shared/services/cctp/worker`). Keeping them
 * out of @vaquita/shared's shared `config/env` means the worker is never forced
 * to carry API secrets it does not use.
 *
 * Validated at import time: the API refuses to boot if any is missing/malformed,
 * failing fast at startup instead of surfacing later as a runtime 401 (session)
 * or a mid-flow mint error (badge signing).
 *
 * dotenv is loaded by app-api.ts (`import 'dotenv/config'`) before this module,
 * so process.env is already populated when this runs.
 */
const apiEnvSchema = z.object({
  // HMAC key for wallet-session tokens (see lib/walletAuth.ts). Must be a FIXED
  // value shared by every PM2 cluster instance (ecosystem config runs
  // instances: 2) — otherwise each instance signs with its own ephemeral key and
  // a token issued by one instance 401s on another. Generate: `openssl rand -hex 32`.
  AUTH_SESSION_SECRET: z
    .string()
    .min(32, 'AUTH_SESSION_SECRET is required and must be at least 32 chars (generate with `openssl rand -hex 32`)'),
  // Ed25519 seed the API signs badge-mint vouchers with (see badges/signer.ts,
  // getBadgeSigningKeypair). 64 hex chars = 32 bytes. Without it the whole badge
  // mint flow is dead — it throws only at voucher/mint time, and badge-monitor
  // skips silently — so require it up front. Generate: `openssl rand -hex 32`.
  BADGE_SIGNING_SEED: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'BADGE_SIGNING_SEED is required and must be 64 hex chars (32 bytes)'),
});

const parsed = apiEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno del API service:');
  console.error(parsed.error.format());
  process.exit(1); // Detener la app si falta un secreto requerido
}

export const apiEnv = parsed.data;
