import type { NextRequest } from 'next/server';
import { getServerEnv } from '@/core-ui/config/serverEnv';

/**
 * Gate compartido de las rutas admin locales: el request debe traer
 * ADMIN_SECRET (requerido, validado con zod) en `x-admin-secret`. No hay open
 * mode. Es un env de SERVIDOR (sin NEXT_PUBLIC_), nunca llega al browser.
 */
export function adminSecretOk(req: NextRequest): boolean {
  return req.headers.get('x-admin-secret') === getServerEnv().ADMIN_SECRET;
}
