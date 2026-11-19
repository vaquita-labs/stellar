import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { apiEnv } from '../config/env';
import {
  PARTNER_RATE_LIMIT,
  PARTNER_RATE_WINDOW_MS,
  requirePartnerApiKey,
  resetPartnerRateLimit,
} from './partnerAuth';

// PARTNER_API_KEY comes from vitest.config.ts.
const KEY = 'test-partner-api-key-0123456789abcdef';

function call(header: string | string[] | undefined, now = 1_000_000) {
  const log = { warn: vi.fn() };
  const req = { headers: { 'x-api-key': header }, ip: '203.0.113.9', path: '/resolve/juan', log } as unknown as Request;
  const json = vi.fn();
  const setHeader = vi.fn();
  const res = { status: vi.fn(() => ({ json })), setHeader } as unknown as Response;
  const ok = requirePartnerApiKey(req, res, now);
  return { ok, log, status: res.status as unknown as ReturnType<typeof vi.fn>, json, setHeader };
}

describe('requirePartnerApiKey', () => {
  beforeEach(() => {
    resetPartnerRateLimit();
    (apiEnv as { PARTNER_API_KEY?: string | undefined }).PARTNER_API_KEY = KEY;
  });

  it('passes the exact key', () => {
    const { ok, status } = call(KEY);
    expect(ok).toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects a wrong, missing or repeated header with 401 and logs it', () => {
    for (const header of ['nope', KEY + 'x', '', undefined, [KEY, KEY]]) {
      const { ok, status, log } = call(header);
      expect(ok).toBe(false);
      expect(status).toHaveBeenCalledWith(401);
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'partner_api_key_rejected', ip: '203.0.113.9' }),
        expect.any(String),
      );
    }
  });

  it('is closed (503) when no key is configured, even with an empty header', () => {
    for (const unset of [undefined, '']) {
      (apiEnv as { PARTNER_API_KEY?: string | undefined }).PARTNER_API_KEY = unset;
      expect(call('').status).toHaveBeenCalledWith(503);
      expect(call(KEY).ok).toBe(false);
    }
  });

  it('answers 429 with Retry-After past the limit and recovers in the next window', () => {
    for (let i = 0; i < PARTNER_RATE_LIMIT; i++) expect(call(KEY, 5_000).ok).toBe(true);

    const blocked = call(KEY, 5_000 + 1_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', '59');

    expect(call(KEY, 5_000 + PARTNER_RATE_WINDOW_MS).ok).toBe(true);
  });

  it('does not let rejected requests spend the quota', () => {
    for (let i = 0; i < PARTNER_RATE_LIMIT * 2; i++) call('nope', 5_000);
    expect(call(KEY, 5_000).ok).toBe(true);
  });
});
