// MUST be first: loads .env.local/.env into process.env before @vaquita/db is
// evaluated, since that package builds the Prisma adapter eagerly from
// process.env.DATABASE_URL at import time (ESM evaluates all imports before
// any file-body statement runs).
import './config/loadEnv';
// Both env schemas (shared base + API-only) validate at import — right after
// dotenv, so a misconfigured deploy fails fast here instead of as a runtime
// 401 or a mid-mint error.
import { env } from '@vaquita/shared';
import { apiEnv } from './config/env';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import pinoHttp from 'pino-http';
import { tryParsePoolError } from '@vaquita/shared';
import { logger, serializeReq } from './lib/logger';
import { httpMetricsMiddleware, isMetricsEnabled } from './lib/metrics';
import {
  createPrismaProductStatsRepository,
  startProductMetricsCollector,
} from './lib/product-metrics';
import router from './routes';

const app = express();

app.use(cors());
// Reports can carry up to 3 screenshots of 2 MB, base64-encoded (~33% overhead),
// so the feedback path gets its own parser. It is mounted BEFORE the global one
// because whichever runs first sets `req.body` and the other then skips: leaving
// the 100 KB default in front would reject the upload before it ever reaches the
// route. Every other endpoint keeps that default.
app.use('/api/v1/feedback', express.json({ limit: '9mb' }));
app.use(express.json());
app.use(httpMetricsMiddleware);

app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Strip the query string from log messages so query-param secrets never
    // land in the log body.
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url?.split('?')[0]} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url?.split('?')[0]} → ${res.statusCode} (${err.message})`,
    serializers: {
      req: serializeReq,
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.use('/api/v1', router);

// Error-handling middleware: ningún error puede silenciarse
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, 'Unhandled error in request pipeline');
  if (res.headersSent) return;

  const poolErr = tryParsePoolError(err);
  if (poolErr) {
    res.status(poolErr.httpStatus).json({
      success: false,
      message: poolErr.message,
      errorCode: poolErr.code,
      requestId: req.id,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    requestId: req.id,
  });
});

// Process-level safety nets: nunca dejar un crash sin log
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandledRejection');
});

const PORT = apiEnv.PORT;

app.listen(PORT, () => {
  logger.info({ port: PORT, env: env.NODE_ENV }, 'API listening');

  // DB-derived product metrics collector. Only runs when metrics are enabled
  // (no point aggregating if nothing scrapes /api/v1/metrics). Refresh interval
  // is tunable via OBSERVABILITY_METRICS_REFRESH_MS.
  if (isMetricsEnabled()) {
    const refreshMs = apiEnv.OBSERVABILITY_METRICS_REFRESH_MS;
    startProductMetricsCollector(createPrismaProductStatsRepository(), refreshMs);
    logger.info({ refreshMs }, 'product metrics collector started');
  }
});