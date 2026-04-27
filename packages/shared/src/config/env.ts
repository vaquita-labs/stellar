import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  SUPABASE_URL: z.string().min(1),
  // SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  process.exit(1); // Detener la app si hay error
}

export const env = parsed.data;
