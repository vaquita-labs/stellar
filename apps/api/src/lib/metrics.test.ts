import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  httpMetricsMiddleware,
  normalizeRoute,
  observeDbHealth,
  observeHttpRequest,
  renderMetrics,
} from './metrics';

// Extract the value of a no-label metric sample line (e.g. `metric_name 3`) so
// assertions can check deltas without depending on cross-test accumulation.
const metricValue = (exposition: string, name: string): number => {
  const match = exposition.match(new RegExp(`^${name} (\\d+(?:\\.\\d+)?)$`, 'm'));
  return match ? Number(match[1]) : 0;
};

describe('metrics registry', () => {
  it('exposes the five API metric names in Prometheus exposition', async () => {
    const output = await renderMetrics();
    expect(output).toContain('vaquita_api_http_requests_total');
    expect(output).toContain('vaquita_api_http_request_duration_seconds');
    expect(output).toContain('vaquita_api_http_requests_in_flight');
    expect(output).toContain('vaquita_api_health_db_latency_seconds');
    expect(output).toContain('vaquita_api_health_db_failures_total');
  });

  it('records an HTTP request with bounded method/route/status labels and its duration', async () => {
    observeHttpRequest({
      method: 'POST',
      route: '/api/v1/deposit/:id',
      statusCode: 201,
      durationSeconds: 0.042,
    });

    const output = await renderMetrics();
    expect(output).toContain(
      'vaquita_api_http_requests_total{method="POST",route="/api/v1/deposit/:id",status="201"} 1',
    );
    expect(output).toContain(
      'vaquita_api_http_request_duration_seconds_count{method="POST",route="/api/v1/deposit/:id",status="201"} 1',
    );
    expect(output).toContain(
      'vaquita_api_http_request_duration_seconds_sum{method="POST",route="/api/v1/deposit/:id",status="201"} 0.042',
    );
  });
});

describe('normalizeRoute', () => {
  it('builds a bounded route template from baseUrl and the matched route path', () => {
    expect(normalizeRoute({ baseUrl: '/api/v1/deposit', route: { path: '/:id' } })).toBe(
      '/api/v1/deposit/:id',
    );
  });

  it('collapses a root-path match without a trailing slash', () => {
    expect(normalizeRoute({ baseUrl: '/api/v1/health', route: { path: '/' } })).toBe(
      '/api/v1/health',
    );
  });

  it('falls back to <unmatched> when no route matched, never the raw URL or query string', () => {
    const label = normalizeRoute({
      baseUrl: '',
      route: undefined,
      originalUrl: '/api/v1/unknown/thing?token=supersecret',
    });
    expect(label).toBe('<unmatched>');
    expect(label).not.toContain('supersecret');
    expect(label).not.toContain('?');
  });
});

describe('observeDbHealth', () => {
  it('increments the failure counter only on failed checks and always records latency', async () => {
    const before = await renderMetrics();
    const failuresBefore = metricValue(before, 'vaquita_api_health_db_failures_total');
    const countBefore = metricValue(before, 'vaquita_api_health_db_latency_seconds_count');

    observeDbHealth({ ok: true, latencySeconds: 0.05 });
    observeDbHealth({ ok: false, latencySeconds: 0.2 });

    const after = await renderMetrics();
    expect(metricValue(after, 'vaquita_api_health_db_failures_total')).toBe(failuresBefore + 1);
    expect(metricValue(after, 'vaquita_api_health_db_latency_seconds_count')).toBe(countBefore + 2);
  });
});

describe('httpMetricsMiddleware', () => {
  it('tracks in-flight during the request and records one observation on finish', async () => {
    const inFlightBefore = metricValue(
      await renderMetrics(),
      'vaquita_api_http_requests_in_flight',
    );

    const res = new EventEmitter() as EventEmitter & { statusCode: number };
    res.statusCode = 200;
    const req = { method: 'GET', baseUrl: '/api/v1/health', route: { path: '/' } };
    let nextCalled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    httpMetricsMiddleware(req as any, res as any, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);

    expect(metricValue(await renderMetrics(), 'vaquita_api_http_requests_in_flight')).toBe(
      inFlightBefore + 1,
    );

    res.emit('finish');

    const after = await renderMetrics();
    expect(metricValue(after, 'vaquita_api_http_requests_in_flight')).toBe(inFlightBefore);
    expect(after).toContain(
      'vaquita_api_http_requests_total{method="GET",route="/api/v1/health",status="200"} 1',
    );
  });
});
