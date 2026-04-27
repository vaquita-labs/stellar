import cors from 'cors';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import router from './routes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) =>
      `${req.method} ${req.url} → ${res.statusCode} (${err.message})`,
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        params: req.params,
        query: req.query,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.use('/api/v1', router);

// Error-handling middleware: ningún error puede silenciarse
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, 'Unhandled error in request pipeline');
  if (res.headersSent) return;
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

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV ?? 'development' }, 'API listening');
});