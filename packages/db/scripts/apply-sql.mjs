// Applies every file in packages/db/sql/ (sorted by name) against DIRECT_URL.
// These files hold schema DDL the Prisma schema language cannot express
// (partial indexes, etc.). Every file MUST be idempotent (IF NOT EXISTS /
// CREATE OR REPLACE): the runner re-executes all of them after each
// `db push`, which also re-creates anything a push reconciliation dropped.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env.local takes precedence over .env, matching the rest of the monorepo.
dotenv.config({ path: [path.join(packageRoot, '.env.local'), path.join(packageRoot, '.env')] });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('❌ DIRECT_URL is required to apply the raw SQL files (direct Postgres connection, port 5432)');
  process.exit(1);
}

const sqlDir = path.join(packageRoot, 'sql');
const files = readdirSync(sqlDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('sql/: nothing to apply');
  process.exit(0);
}

// Hosted Postgres (Supabase) requires TLS on direct connections; local
// databases do not offer it. Try TLS first and fall back to plaintext when
// the server rejects it.
async function connect() {
  const withSsl = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await withSsl.connect();
    return withSsl;
  } catch (error) {
    if (!String(error?.message).includes('does not support SSL')) throw error;
    const plain = new pg.Client({ connectionString: url });
    await plain.connect();
    return plain;
  }
}

const client = await connect();
try {
  for (const file of files) {
    process.stdout.write(`sql/${file}... `);
    await client.query(readFileSync(path.join(sqlDir, file), 'utf8'));
    console.log('ok');
  }
} finally {
  await client.end();
}
