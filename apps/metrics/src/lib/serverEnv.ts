import { z } from 'zod';

// SERVER-ONLY env (no NEXT_PUBLIC_ prefix): never import from client components.
const envServerSchema = z.object({
  // Pooled Postgres connection used by every metric query via @vaquita/db.
  DATABASE_URL: z.string().min(1),
  // Passcode that gates EVERY route (enforced by src/proxy.ts).
  METRICS_PASSCODE: z.string().min(8, 'METRICS_PASSCODE is required (min 8 chars) — the login gate is never open'),
  // Free-form label shown in the header (e.g. "production", "staging").
  METRICS_ENV_LABEL: z.string().default('unknown'),
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
    DATABASE_URL: process.env.DATABASE_URL,
    METRICS_PASSCODE: process.env.METRICS_PASSCODE,
    METRICS_ENV_LABEL: process.env.METRICS_ENV_LABEL || undefined,
  });
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }
  cached = parsed.data;
  return cached;
}
