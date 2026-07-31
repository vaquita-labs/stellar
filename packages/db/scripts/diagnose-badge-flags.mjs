// Read-only report of which badges the app will actually show, and why.
//
// Visibility is decided by two columns the admin panel writes — `enabled` and
// `hidden` — and nothing surfaces a badge that is live by accident. This lists
// what each combination currently means for the grid, so a test badge sitting
// in production is visible as such.
//
//   cd packages/db && node scripts/diagnose-badge-flags.mjs
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
    `SELECT a.key, a.name, a.description, a.enabled, a.hidden, a.unlock_type,
            a.display_order,
            (SELECT count(*)::int FROM profiles_achievements pa
              WHERE pa.achievement_id = a.id) AS claims
       FROM achievements a
      WHERE a.deleted_at IS NULL
      ORDER BY a.display_order, a.key`,
  );

  // What the public catalog serves: enabled and not hidden.
  const visible = rows.filter((r) => r.enabled && !r.hidden);
  console.log(`En la grilla pública (${visible.length}):`);
  for (const r of visible) {
    const suspicious = r.name.trim().toLowerCase() === r.description.trim().toLowerCase();
    console.log(
      `   ${String(r.display_order).padStart(2)}  ${r.key.padEnd(18)} ${r.unlock_type.padEnd(11)}` +
        ` claims=${String(r.claims).padStart(3)}  "${r.name}"${suspicious ? '   ⚠️ name === description' : ''}`,
    );
  }

  const hidden = rows.filter((r) => r.enabled && r.hidden);
  if (hidden.length > 0) {
    console.log(`\nOcultos, sólo tras reclamar (${hidden.length}):`);
    for (const r of hidden) console.log(`   ${r.key.padEnd(18)} ${r.unlock_type.padEnd(11)} claims=${r.claims}`);
  }

  const off = rows.filter((r) => !r.enabled);
  if (off.length > 0) {
    console.log(`\nDeshabilitados (${off.length}):`);
    for (const r of off) console.log(`   ${r.key.padEnd(18)} claims=${r.claims}`);
  }

  console.log('');
} finally {
  await client.end().catch(() => {});
}
