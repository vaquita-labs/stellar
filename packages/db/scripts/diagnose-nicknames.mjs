// Read-only audit of nickname uniqueness.
//
// `nickname` is the public URL segment (/leaderboard/<nickname>,
// /explore/<nickname>) and is about to become the key the share-card renderer
// resolves a claim by, but the column carries no UNIQUE constraint — only a
// format CHECK and a trigram index. Duplicates would make every one of those
// lookups ambiguous, so they have to be found and resolved before the
// constraint can be added.
//
//   cd packages/db && node scripts/diagnose-nicknames.mjs
//
// Issues no writes. NULLs are reported separately: Postgres allows many NULLs
// under a UNIQUE index, so they do not block the constraint.
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
  const { rows: [who] } = await client.query('SELECT current_database() AS db');
  console.log(`\n📍 host=${new URL(url).hostname}  database=${who.db}\n`);

  const { rows: [totals] } = await client.query(
    `SELECT count(*)::int AS total,
            count(nickname)::int AS with_nickname,
            count(*) FILTER (WHERE nickname IS NULL)::int AS null_nickname,
            count(DISTINCT nickname)::int AS distinct_nicknames
       FROM profiles WHERE deleted_at IS NULL`,
  );
  console.log(
    `profiles: ${totals.total} — ${totals.with_nickname} con nickname ` +
      `(${totals.distinct_nicknames} distintos), ${totals.null_nickname} en NULL`,
  );

  // Case-insensitive too: the format CHECK already restricts to lowercase, but a
  // row written before that constraint could still collide once compared loosely,
  // and the URL segment is case-insensitive in practice.
  const { rows: dupes } = await client.query(
    `SELECT lower(nickname) AS nick, count(*)::int AS n,
            array_agg(id ORDER BY id) AS ids
       FROM profiles
      WHERE deleted_at IS NULL AND nickname IS NOT NULL
      GROUP BY lower(nickname) HAVING count(*) > 1
      ORDER BY count(*) DESC, lower(nickname)`,
  );

  if (dupes.length === 0) {
    console.log('\n✅ Sin nicknames duplicados. Se puede agregar el UNIQUE.\n');
  } else {
    console.log(`\n⛔ ${dupes.length} nicknames duplicados — el UNIQUE fallaría:`);
    for (const d of dupes) console.log(`   ${d.nick}  ×${d.n}  (profiles ${d.ids.join(', ')})`);
    console.log('\nHay que renombrar los repetidos antes de aplicar la constraint.\n');
  }

  // Soft-deleted rows still occupy the key: a plain UNIQUE index covers them, so
  // a deleted profile can block a live one from taking its nickname back.
  const { rows: [deleted] } = await client.query(
    `SELECT count(*)::int AS n FROM profiles WHERE deleted_at IS NOT NULL AND nickname IS NOT NULL`,
  );
  if (deleted.n > 0) {
    const { rows: clashes } = await client.query(
      `SELECT lower(d.nickname) AS nick, count(*)::int AS n
         FROM profiles d
         JOIN profiles a ON a.deleted_at IS NULL AND lower(a.nickname) = lower(d.nickname)
        WHERE d.deleted_at IS NOT NULL AND d.nickname IS NOT NULL
        GROUP BY lower(d.nickname)`,
    );
    console.log(`perfiles borrados con nickname: ${deleted.n}` +
      (clashes.length > 0 ? `  ⚠️ ${clashes.length} chocan con uno vivo: ${clashes.map((c) => c.nick).join(', ')}` : ''));
    console.log('   (un UNIQUE parcial `WHERE deleted_at IS NULL` los deja fuera)\n');
  }
} finally {
  await client.end();
}
