import type { NextRequest } from 'next/server';
import { getServerEnv } from '@/core-ui/config/serverEnv';

/**
 * Shared gate of the local admin routes: the request must carry ADMIN_SECRET
 * (required, zod-validated) in `x-admin-secret`. SERVER env (no NEXT_PUBLIC_
 * prefix), so it never reaches the browser.
 */
export function adminSecretOk(req: NextRequest): boolean {
  return req.headers.get('x-admin-secret') === getServerEnv().ADMIN_SECRET;
}
