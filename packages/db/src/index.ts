import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';

import { PrismaClient } from './generated/prisma/client';

// Env que este paquete consume, validada con zod y requerida: sin
// DATABASE_URL, el driver de pg caería a los defaults de libpq y fallaría
// recién en la primera query con un ECONNREFUSED confuso — acá falla al cargar
// el módulo con el error de configuración real.
const dbEnv = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (pooled Postgres connection string)'),
    NODE_ENV: z.enum(['development', 'production', 'test']),
  })
  .parse({ DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: process.env.NODE_ENV });

// Prisma 7 connects through a driver adapter rather than a built-in datasource
// URL. We use @prisma/adapter-pg (node-postgres) with the pooled connection
// string (Supavisor / pgbouncer, port 6543).
const adapter = new PrismaPg({ connectionString: dbEnv.DATABASE_URL });

// Single shared PrismaClient across the whole backend. A module-level singleton
// avoids exhausting the connection pool when this package is imported by
// multiple services in the same process (and survives dev hot-reloads).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: dbEnv.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (dbEnv.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from './generated/prisma/client';
