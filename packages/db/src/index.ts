import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';

import { PrismaClient } from './generated/prisma/client';

// Env this package consumes, zod-validated and required: without DATABASE_URL
// the pg driver would fall back to libpq defaults and only fail on the first
// query with a confusing ECONNREFUSED — here it fails with the real
// configuration error.
const dbEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (pooled Postgres connection string)'),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

// Single shared PrismaClient across the whole backend. A module-level singleton
// avoids exhausting the connection pool when this package is imported by
// multiple services in the same process (and survives dev hot-reloads).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (client) return client;

  const dbEnv = dbEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  // Prisma 7 connects through a driver adapter rather than a built-in datasource
  // URL. We use @prisma/adapter-pg (node-postgres) with the pooled connection
  // string (Supavisor / pgbouncer, port 6543).
  client =
    globalForPrisma.prisma ??
    new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbEnv.DATABASE_URL }),
      log: dbEnv.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

  if (dbEnv.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }

  return client;
}

// The client is built on first property access, not at import. `next build`
// imports every route module to collect its metadata, so importing this package
// must not require a connection string that only exists at runtime — otherwise
// the Next apps would need DATABASE_URL as a build arg. A misconfigured deploy
// still fails on its first query with the zod detail.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = getClient();
    const value = Reflect.get(instance, property);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export * from './generated/prisma/client';
