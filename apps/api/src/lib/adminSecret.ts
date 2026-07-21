import { type Request, type Response } from 'express';

/**
 * Shared admin gate for the remaining admin-only endpoints. If ADMIN_SECRET is
 * set, the request must echo it in `x-admin-secret`; if unset, the endpoint is
 * open (dev only). Lived in routes/admin/route.ts until the achievement CRUD
 * moved to the admin app's own route handlers and that router was removed.
 */
export function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true; // not configured — open (dev only)
  const provided = req.headers['x-admin-secret'] as string | undefined;
  if (provided !== secret) {
    res.status(403).json({ status: 'error', message: 'Forbidden' });
    return false;
  }
  return true;
}
