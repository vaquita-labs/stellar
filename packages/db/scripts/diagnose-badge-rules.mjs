// Read-only dump of the unlock rule behind each badge.
//
// Badge copy is written by hand and the rule lives in a JSON column, so nothing
// forces the description to match what actually unlocks the badge. A
// translation written from the key name rather than the rule can end up
// promising the user something the engine never checks.
//
//   cd packages/db && node scripts/diagnose-badge-rules.mjs
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
client.on('error', () => {});

try {
  console.log(`\n📍 host=${new URL(url).hostname}\n`);

  const { rows } = await client.query(
    `SELECT key, name, description, unlock_type, code, rule, coin_reward, xp_reward
       FROM achievements WHERE deleted_at IS NULL ORDER BY display_order, key`,
  );

  for (const r of rows) {
    const rule = r.rule ? JSON.stringify(r.rule) : r.unlock_type === 'rule' ? '⚠️ unlock_type=rule pero rule IS NULL' : '—';
    console.log(`${r.key}`);
    console.log(`   name:  "${r.name}"`);
    console.log(`   desc:  "${r.description}"`);
    console.log(`   rule:  ${rule}`);
    console.log(`   recompensa: ${r.coin_reward} monedas, ${r.xp_reward} XP${r.code ? `  · código: ${r.code}` : ''}`);
    console.log('');
  }
} finally {
  await client.end().catch(() => {});
}
