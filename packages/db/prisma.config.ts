// Prisma 7 config. Replaces the `url`/`directUrl` that used to live in the
// datasource block of schema.prisma.
//
// `datasource.url` is what the Prisma CLI (e.g. `prisma db pull`) connects with.
// We point it at DIRECT_URL (direct Postgres, port 5432) because introspection
// can't run reliably through the Supavisor / pgbouncer pooler.
//
// The runtime connection is NOT configured here — it goes through the
// @prisma/adapter-pg driver adapter constructed in src/index.ts with DATABASE_URL.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
});
