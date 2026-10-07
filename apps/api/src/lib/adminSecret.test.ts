import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireAdminSecret, secretMatches } from './adminSecret';

// ADMIN_SECRET comes from vitest.config.ts: 'test-admin-secret-0123456789abcdef'.
const SECRET = 'test-admin-secret-0123456789abcdef';

function call(header: string | string[] | undefined) {
  const log = { warn: vi.fn() };
  const req = { headers: { 'x-admin-secret': header }, ip: '203.0.113.9', path: '/admin/send', log } as unknown as Request;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  const ok = requireAdminSecret(req, res);
  return { ok, log, status: res.status as unknown as ReturnType<typeof vi.fn>, json };
}

describe('secretMatches', () => {
  it('accepts only the exact secret', () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(secretMatches(SECRET + 'x', SECRET)).toBe(false);
    expect(secretMatches('', SECRET)).toBe(false);
  });
});

describe('requireAdminSecret', () => {
  it('passes a matching header without touching the response', () => {
    const { ok, status, log } = call(SECRET);
    expect(ok).toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('rejects a wrong header with 403 and logs the caller', () => {
    const { ok, status, json, log } = call('nope');
    expect(ok).toBe(false);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ status: 'error', message: 'Forbidden' });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'admin_secret_rejected', ip: '203.0.113.9', path: '/admin/send' }),
      expect.any(String),
    );
  });

  it('rejects a missing header', () => {
    expect(call(undefined).ok).toBe(false);
  });

  it('rejects a repeated header (array) rather than comparing a non-string', () => {
    expect(call([SECRET, SECRET]).ok).toBe(false);
  });
});
