import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';

import { PrismaClient } from './generated/prisma/client';

// Env this package consumes, zod-validated and required: without DATABASE_URL
// the pg driver would fall back to libpq defaults and only fail on the first
// query with a confusing ECONNREFUSED — here it fails at module load with the
// real configuration error.
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
