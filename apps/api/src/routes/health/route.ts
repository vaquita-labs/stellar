import { Router } from 'express';
import { env, sendError, sendSuccess } from '@vaquita/shared';

const router = Router();

// Liveness — answers "is the API process alive?". No external dependencies,
// so a flaky Supabase doesn't mark the whole service down (which would make
// orchestrators reboot the container for no reason).
router.get('/', (req, res) => {
  req.log.info('GET /health (liveness)');
  return sendSuccess(
    res,
    {
      service: 'ok',
      env: process.env.NODE_ENV ?? 'development',
      uptimeSec: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    },
    'alive',
  );
});

// Readiness — answers "can the API reach Supabase?". Hits PostgREST's root,
// which returns the OpenAPI spec and exists on every Supabase project. Avoids
// coupling the health check to any application table, so a missing schema in
// dev doesn't make the check flap.
router.get('/db', async (req, res) => {
  req.log.info('GET /health/db (Supabase ping)');

  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`;
  const ts = () => new Date().toISOString();
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      req.log.error({ status: response.status, latencyMs }, 'Supabase responded with non-2xx');
      return sendError(
        res,
        'Supabase health check failed',
        { db: 'down', env: env.NODE_ENV, ts: ts(), latencyMs, status: response.status },
        503,
      );
    }

    return sendSuccess(
      res,
      { db: 'ok', env: env.NODE_ENV, ts: ts(), latencyMs },
      'db reachable',
    );
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const detail = err instanceof Error ? err.message : String(err);
    req.log.error({ err, latencyMs }, 'Supabase health check threw');
    return sendError(
      res,
      'Supabase health check failed',
      { db: 'down', env: env.NODE_ENV, ts: ts(), latencyMs, detail },
      503,
    );
  }
});

export default router;