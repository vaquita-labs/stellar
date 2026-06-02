import { z } from 'zod';

const envClientSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  NEXT_PUBLIC_SERVICES_URL: z.string().min(1),
  // Sent as the `x-admin-secret` header on admin write calls. Optional so dev
  // works against a backend with no ADMIN_SECRET configured (open mode).
  // SECURITY: NEXT_PUBLIC_ vars ship to the browser — only acceptable because
  // the admin app is expected to live behind network/SSO access control.
  NEXT_PUBLIC_ADMIN_SECRET: z.string().optional(),
});

const parsed = envClientSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SERVICES_URL: process.env.NEXT_PUBLIC_SERVICES_URL,
  NEXT_PUBLIC_ADMIN_SECRET: process.env.NEXT_PUBLIC_ADMIN_SECRET,
});

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  throw new Error('Variables de entorno inválidas');
}

export const clientEnv = parsed.data;
