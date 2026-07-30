// Read-only audit of badge-key naming across an environment's database.
//
// The code resolves badges by key: i18n looks up `achievements.items.<key>`,
// the podium check compares against `first_place`/`second_place`/`third_place`,
// and `badge_claims.badge_type` stores the same key. All of that assumes the
// underscore spelling the production catalog uses, so an environment seeded
// from the older migrations — which wrote hyphens — silently misses on every
// one of those lookups.
//
// Run once per environment with that environment's DIRECT_URL:
//   cd packages/db && node scripts/diagnose-badge-keys.mjs
//
// Issues no writes. Reports what a rename would have to touch, including the
// `badge_claims` rows that would need to move in the same transaction and any
// key whose underscored form is already taken (those collide with the UNIQUE
// index and need a manual decision).
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
try {
  // Identify the target without printing credentials.
  const { rows: [who] } = await client.query(
    'SELECT current_database() AS db, inet_server_addr()::text AS host',
  );
  console.log(`\n📍 database=${who.db} host=${who.host ?? 'local'}\n`);

  const { rows: badges } = await client.query(
    'SELECT key, name, enabled, hidden FROM achievements WHERE deleted_at IS NULL ORDER BY display_order, key',
  );
  const hyphen = badges.filter((b) => b.key.includes('-'));
  const underscore = badges.filter((b) => !b.key.includes('-'));

  console.log(`achievements: ${badges.length} filas — ${underscore.length} sin guion, ${hyphen.length} con guion`);

  if (hyphen.length === 0) {
    console.log('✅ Sin keys con guion. Esta base ya está alineada con el código.\n');
  } else {
    console.log('\n⚠️  Keys con guion (el código NO las resuelve):');
    for (const b of hyphen) {
      const target = b.key.replace(/-/g, '_');
      const taken = badges.some((o) => o.key === target);
      console.log(
        `   ${b.key}  →  ${target}${taken ? '   ⛔ COLISIÓN: ya existe esa key' : ''}` +
          `   [${b.enabled ? 'enabled' : 'disabled'}${b.hidden ? ', hidden' : ''}]`,
      );
    }
  }

  // badge_claims.badge_type holds the achievement key, so it has to move in the
  // same transaction or vouchers/mints stop matching their badge.
  const { rows: claims } = await client.query(
    "SELECT badge_type, count(*)::int AS n FROM badge_claims WHERE badge_type LIKE '%-%' GROUP BY badge_type ORDER BY badge_type",
  );
  console.log(`\nbadge_claims con guion en badge_type: ${claims.length} tipos distintos`);
  for (const c of claims) console.log(`   ${c.badge_type}  (${c.n} filas)`);

  // Orphans either way: claims whose badge_type matches no achievement row.
  const { rows: orphans } = await client.query(
    `SELECT bc.badge_type, count(*)::int AS n
       FROM badge_claims bc
       LEFT JOIN achievements a ON a.key = bc.badge_type
      WHERE a.key IS NULL
      GROUP BY bc.badge_type ORDER BY bc.badge_type`,
  );
  if (orphans.length > 0) {
    console.log('\n⚠️  badge_claims sin achievement correspondiente:');
    for (const o of orphans) console.log(`   ${o.badge_type}  (${o.n} filas)`);
  }

  console.log('');
} finally {
  await client.end();
}
