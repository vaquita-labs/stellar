// Read-only check that the nickname uniqueness index actually exists and is
// the partial one the schema describes.
//
// `CREATE UNIQUE INDEX IF NOT EXISTS` succeeds silently when an index of that
// name is already there, whatever its definition — so a clean apply is not by
// itself evidence the constraint is the intended one.
//
//   cd packages/db && node scripts/verify-nickname-unique.mjs
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
// The pooler can drop the socket during teardown; that is not a result.
client.on('error', () => {});

try {
  console.log(`\n📍 host=${new URL(url).hostname}`);

  const { rows } = await client.query(
    `SELECT indexdef FROM pg_indexes
      WHERE tablename = 'profiles' AND indexname = 'profiles_nickname_unique'`,
  );

  if (rows.length === 0) {
    console.log('\n❌ profiles_nickname_unique NO existe\n');
    process.exitCode = 1;
  } else {
    const def = rows[0].indexdef;
    console.log(`\n${def}\n`);
    const unique = def.includes('CREATE UNIQUE INDEX');
    const partial = def.includes('deleted_at IS NULL') && def.includes('nickname IS NOT NULL');
    console.log(`   ${unique ? '✅' : '❌'} es UNIQUE`);
    console.log(`   ${partial ? '✅' : '❌'} es parcial (nickname NOT NULL + no borrados)`);
    if (!unique || !partial) process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => {});
}
