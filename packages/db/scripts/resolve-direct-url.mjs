/**
 * Connection string for migration / SQL CLI scripts.
 *
 * Prefer DIRECT_URL (port 5432). If it is missing but DATABASE_URL is set,
 * rewrite the usual Supabase pooler form (:6543 + pgbouncer=true) to session
 * mode on :5432 on the same host — that is what DIRECT_URL is in .env.example.
 * DDL through transaction-mode pgbouncer is not reliable.
 */
export function resolveDirectUrl(env = process.env) {
  const direct = env.DIRECT_URL?.trim();
  if (direct) return { url: direct, source: 'DIRECT_URL' };

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return {
      error:
        'Set DIRECT_URL (Postgres :5432), or DATABASE_URL so the script can rewrite pooler :6543 → :5432',
    };
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return { error: 'DATABASE_URL is not a valid URL' };
  }

  const looksPooled = parsed.port === '6543' || parsed.searchParams.get('pgbouncer') === 'true';
  if (looksPooled) {
    parsed.port = '5432';
    parsed.searchParams.delete('pgbouncer');
    return { url: parsed.toString(), source: 'DATABASE_URL (rewritten :6543→:5432)' };
  }

  return { url: databaseUrl, source: 'DATABASE_URL' };
}
