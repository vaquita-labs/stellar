import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { apiEnv } from '../config/env';

export const register = new Registry();

const httpRequestsTotal = new Counter({
  name: 'vaquita_api_http_requests_total',
  help: 'Total API HTTP requests, labeled by method, route template, and status.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'vaquita_api_http_request_duration_seconds',
  help: 'API HTTP request duration in seconds, labeled by method, route template, and status.',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsInFlight = new Gauge({
  name: 'vaquita_api_http_requests_in_flight',
  help: 'Number of API HTTP requests currently being served.',
  registers: [register],
});

const healthDbLatencySeconds = new Histogram({
  name: 'vaquita_api_health_db_latency_seconds',
  help: 'Latency of the database readiness check in seconds.',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const healthDbFailuresTotal = new Counter({
  name: 'vaquita_api_health_db_failures_total',
  help: 'Total database readiness check failures.',
  registers: [register],
});

export interface RouteLike {
  baseUrl?: string;
  route?: { path?: string | string[] } | undefined;
  originalUrl?: string;
}

// Build a bounded route-template label from the router mount prefix plus the
// matched route path only — never `originalUrl`/`url`, which carry raw ids and
// query strings and would explode label cardinality. Unmatched requests (404s)
// collapse to a single `<unmatched>` bucket.
export const normalizeRoute = (req: RouteLike): string => {
  const path = req.route?.path;
  if (typeof path !== 'string') return '<unmatched>';

  const combined = `${req.baseUrl ?? ''}${path}`;
  if (combined === '') return '<unmatched>';
  const trimmed = combined.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
};

export interface HttpRequestObservation {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}

export const observeHttpRequest = ({
  method,
  route,
  statusCode,
  durationSeconds,
}: HttpRequestObservation): void => {
  const labels = { method, route, status: String(statusCode) };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
};

export interface DbHealthObservation {
  ok: boolean;
  latencySeconds: number;
}

export const observeDbHealth = ({ ok, latencySeconds }: DbHealthObservation): void => {
  healthDbLatencySeconds.observe(latencySeconds);
  if (!ok) healthDbFailuresTotal.inc();
};

// Express middleware: counts in-flight requests and, once the response
// finishes, records the request with a bounded route-template label plus its
// duration. Route resolution is read on `finish` because `req.route` is only
// populated after Express matches the handler.
export const httpMetricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  httpRequestsInFlight.inc();
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    httpRequestsInFlight.dec();
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    observeHttpRequest({
      method: req.method,
      route: normalizeRoute(req),
      statusCode: res.statusCode,
      durationSeconds,
    });
  });

  next();
};

export const renderMetrics = (): Promise<string> => register.metrics();

// Metrics exposure is opt-in per the observability PRD (dev is off by default;
// staging/prod enable it). The recording middleware always runs — it is cheap
// and in-memory — but the scrape endpoint is only registered when enabled, and
// is intended for private host/container scraping only, never public exposure.
export const isMetricsEnabled = (): boolean => apiEnv.OBSERVABILITY_METRICS_ENABLED === 'true';

export const metricsHandler = async (_req: Request, res: Response): Promise<void> => {
  res.set('Content-Type', register.contentType);
  res.send(await renderMetrics());
};
