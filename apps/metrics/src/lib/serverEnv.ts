import { z } from 'zod';

// SERVER-ONLY env (no NEXT_PUBLIC_ prefix): never import from client components.
const envServerSchema = z.object({
  // Pooled Postgres connection used by every metric query via @vaquita/db.
  DATABASE_URL: z.string().min(1),
  // Passcode that gates EVERY route (enforced by src/proxy.ts).
  METRICS_PASSCODE: z.string().min(8, 'METRICS_PASSCODE is required (min 8 chars) — the login gate is never open'),
  // Free-form label shown in the header (e.g. "production", "staging").
  METRICS_ENV_LABEL: z.string().default('unknown'),
  // Cloudflare Access in front of the console (docs/ops/admin-access.md).
  // Both or neither; with both set every request must carry a valid token.
  CF_ACCESS_TEAM_DOMAIN: z
    .string()
    .regex(/^[a-z0-9-]+\.cloudflareaccess\.com$/, 'CF_ACCESS_TEAM_DOMAIN looks like <team>.cloudflareaccess.com')
    .optional(),
  CF_ACCESS_AUD: z.string().min(16).optional(),
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
    CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN || undefined,
    CF_ACCESS_AUD: process.env.CF_ACCESS_AUD || undefined,
  });
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    throw new Error('Invalid environment variables');
  }
  if (!!parsed.data.CF_ACCESS_TEAM_DOMAIN !== !!parsed.data.CF_ACCESS_AUD) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set together');
  }
  cached = parsed.data;
  return cached;
}

/** The Access settings when the console is behind Cloudflare Access, else null. */
export function getAccessConfig(): { teamDomain: string; aud: string } | null {
  const env = getServerEnv();
  return env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD
    ? { teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD }
    : null;
}
