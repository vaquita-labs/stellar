import { pino } from 'pino';

// Standalone logger for the reconciler job. Intentionally does NOT depend on
// the API's config/env validation (AUTH_SESSION_SECRET, ADMIN_SECRET, …) — the
// reconcile job only needs DATABASE_URL + Stellar RPC config, so it must not be
// coupled to the API service's required secrets.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: '@vaquita/reconciler' },
});
