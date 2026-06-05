import { Router } from 'express';
import { env, prisma, sendError, sendSuccess } from '@vaquita/shared';

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

// Readiness — answers "can the API reach the database?". Runs a trivial
// `SELECT 1` through Prisma, which exercises the connection pool without
// coupling the check to any application table, so a missing schema in dev
// doesn't make the check flap.
router.get('/db', async (req, res) => {
  req.log.info('GET /health/db (database ping)');

  const ts = () => new Date().toISOString();
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startedAt;

    return sendSuccess(
      res,
      { db: 'ok', env: env.NODE_ENV, ts: ts(), latencyMs },
      'db reachable',
    );
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const detail = err instanceof Error ? err.message : String(err);
    req.log.error({ err, latencyMs }, 'Database health check threw');
    return sendError(
      res,
      'Database health check failed',
      { db: 'down', env: env.NODE_ENV, ts: ts(), latencyMs, detail },
      503,
    );
  }
});

export default router;