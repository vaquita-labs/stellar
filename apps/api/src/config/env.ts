import { z } from 'zod';

/**
 * API-service-only environment validation. The shared base schema
 * (@vaquita/shared config/env) covers the vars the shared services read; this
 * one covers what only the API service reads. Both are required sets — the API
 * refuses to boot if any var is missing/malformed, failing fast at startup
 * instead of surfacing later as a runtime error.
 *
 * dotenv is loaded by app-api.ts (`import 'dotenv/config'`) before this module,
 * so process.env is already populated when this runs.
 */
const apiEnvSchema = z.object({
  // HTTP port the API listens on.
  PORT: z.string().regex(/^\d+$/).transform(Number),
  // HMAC key for wallet-session tokens (see lib/walletAuth.ts). Must be a FIXED
  // value shared by every PM2 cluster instance (ecosystem config runs
  // instances: 2) — otherwise each instance signs with its own ephemeral key and
  // a token issued by one instance 401s on another. Generate: `openssl rand -hex 32`.
  AUTH_SESSION_SECRET: z
    .string()
    .min(32, 'AUTH_SESSION_SECRET is required and must be at least 32 chars (generate with `openssl rand -hex 32`)'),
  // Domain label used as the wallet-auth challenge's manage_data key.
  AUTH_HOME_DOMAIN: z.string().min(1),
  // 'false' logs instead of rejecting missing/invalid wallet sessions (escape
  // hatch, e.g. while confirming every wallet type can sign challenges).
  WALLET_AUTH_ENFORCE: z.enum(['true', 'false']),
  // Admin endpoints require this exact value in the `x-admin-secret` header.
  // Never empty: there is no "open mode".
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ADMIN_SECRET: z.string().min(16, 'ADMIN_SECRET is required (min 16 chars) — admin endpoints are never open'),
  // Pino log level.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  // 'true' registers GET /api/v1/metrics (Prometheus exposition, private-only
  // scraping) and starts the DB-derived product metrics collector.
  OBSERVABILITY_METRICS_ENABLED: z.enum(['true', 'false']),
  // Refresh interval (ms) for the product metrics collector.
  OBSERVABILITY_METRICS_REFRESH_MS: z.string().regex(/^\d+$/).transform(Number),
});

const parsed = apiEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration for the API service:');
  console.error(parsed.error.format());
  process.exit(1); // stop the app when a required secret is missing
}

export const apiEnv = parsed.data;
