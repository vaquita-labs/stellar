// Read-only: which database DIRECT_URL points at, and whether that role owns
// the tables a migration would ALTER.
//
//   cd packages/db && node scripts/whoami.mjs
//
// apply-migration.mjs prints the host and applies in the same breath, so there
// is no chance to abort once it has told you where you are. This is the look
// before the leap: same connection, same resolution order, no writes.
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
client.on('error', (error) => console.warn(`⚠️  connection: ${error.message}`));
try {
  const { rows: [who] } = await client.query(
    'select current_database() as db, current_user as usr, session_user as session_usr',
  );
  console.log(`\n📍 host=${new URL(url).hostname}  database=${who.db}  user=${who.usr}\n`);

  const { rows } = await client.query(
    `select tablename, tableowner, pg_has_role(current_user, tableowner, 'member') as can_alter
       from pg_tables where schemaname = 'public' order by tablename`,
  );
  const blocked = rows.filter((r) => !r.can_alter);
  console.log(`${rows.length} tables, ${blocked.length} this role cannot ALTER`);
  if (blocked.length) console.table(blocked);
} finally {
  await client.end();
}
