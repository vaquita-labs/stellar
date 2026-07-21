import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  // Pooled Postgres connection used by the Prisma driver adapter (@vaquita/db).
  DATABASE_URL: z.string().min(1),
  // Duración (en segundos reales) de un día COMPLETO del reloj de juego. El día
  // corre acelerado tipo Minecraft; por defecto 1200s = 20 min. Es global (el
  // servidor lo sirve a todos por igual vía GET /api/v1/time).
  GAME_DAY_LENGTH_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional()
    .default(1200),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en configuración de variables de entorno:');
  console.error(parsed.error.format());
  process.exit(1); // Detener la app si hay error
}

export const env = parsed.data;
