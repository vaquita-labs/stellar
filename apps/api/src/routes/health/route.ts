import { Router } from 'express';
import { sendError, sendSuccess, supabase } from '@vaquita/shared';

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

// Readiness — answers "can the API reach Supabase?". Used to verify the DB
// dependency end-to-end.
router.get('/db', async (req, res) => {
  req.log.info('GET /health/db (Supabase ping)');

  const startedAt = Date.now();
  const { error } = await supabase.from('tenant_config').select('network_name').limit(1);
  const latencyMs = Date.now() - startedAt;

  const env = process.env.NODE_ENV ?? 'development';
  const ts = new Date().toISOString();

  if (error) {
    req.log.error({ err: error, latencyMs }, 'Supabase health check failed');
    return sendError(
      res,
      'Supabase health check failed',
      { db: 'down', env, ts, latencyMs, detail: error.message },
      503,
    );
  }

  return sendSuccess(res, { db: 'ok', env, ts, latencyMs }, 'db reachable');
});

export default router;