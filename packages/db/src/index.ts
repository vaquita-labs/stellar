import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

// Prisma 7 connects through a driver adapter rather than a built-in datasource
// URL. We use @prisma/adapter-pg (node-postgres) with the pooled connection
// string (Supavisor / pgbouncer, port 6543).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Single shared PrismaClient across the whole backend. A module-level singleton
// avoids exhausting the connection pool when this package is imported by
// multiple services in the same process (and survives dev hot-reloads).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from './generated/prisma/client';
