import { type Request, type Response } from 'express';
import { apiEnv } from '../config/env';

/**
 * Shared admin gate for the admin-only endpoints: the request must echo
 * ADMIN_SECRET (required, validated at boot) in `x-admin-secret`. There is no
 * open mode.
 */
export function requireAdminSecret(req: Request, res: Response): boolean {
  const provided = req.headers['x-admin-secret'] as string | undefined;
  if (provided !== apiEnv.ADMIN_SECRET) {
    res.status(403).json({ status: 'error', message: 'Forbidden' });
    return false;
  }
  return true;
}
