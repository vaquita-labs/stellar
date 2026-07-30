// Applies one SQL migration from apps/supabase/migrations against DIRECT_URL.
//
// Those migrations have no runner — they were applied by hand — so this exists
// to run one deliberately, naming the target by connection host so the
// environment is visible before anything is written. The server's own
// inet_server_addr() is a private address behind the proxy and cannot tell
// prod from staging; the domain in the connection string can.
//
//   cd packages/db && node scripts/apply-migration.mjs <file.sql>
//
// The file is expected to carry its own BEGIN/COMMIT.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: [path.join(packageRoot, '.env.local'), path.join(packageRoot, '.env')] });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('❌ DIRECT_URL is required (direct Postgres connection, port 5432)');
  process.exit(1);
}

const name = process.argv[2];
if (!name) {
  console.error('❌ usage: node scripts/apply-migration.mjs <file.sql>');
  process.exit(1);
}

const file = path.join(packageRoot, '..', '..', 'apps', 'supabase', 'migrations', name);
const sql = readFileSync(file, 'utf8');

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
  const { rows: [who] } = await client.query('SELECT current_database() AS db');
  console.log(`\n📍 host=${new URL(url).hostname}  database=${who.db}`);
  console.log(`📄 ${name}\n`);

  await client.query(sql);
  console.log('✅ aplicada\n');
} finally {
  await client.end();
}
