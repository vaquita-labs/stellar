import { timingSafeEqual } from 'crypto';
import { type Request, type Response } from 'express';
import { apiEnv } from '../config/env';

/**
 * Shared admin gate for the admin-only endpoints: the request must echo
 * ADMIN_SECRET (required, validated at boot) in `x-admin-secret`. There is no
 * open mode.
 *
 * The comparison is constant-time, and every rejection is logged with the
 * caller's address: a burst of these is the signal that someone is guessing
 * the secret, and it is what a log monitor turns into an incident.
 */
export function requireAdminSecret(req: Request, res: Response): boolean {
  const provided = req.headers['x-admin-secret'];
  if (typeof provided === 'string' && secretMatches(provided, apiEnv.ADMIN_SECRET)) return true;

  req.log.warn({ event: 'admin_secret_rejected', ip: req.ip, path: req.path }, 'admin secret rejected');
  res.status(403).json({ status: 'error', message: 'Forbidden' });
  return false;
}

export function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
