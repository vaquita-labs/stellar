import { BUILD_STAMP } from '@/core-ui/config/buildStamp';

/**
 * Which build this container is serving. Public and unauthenticated: it answers
 * one opaque string and nothing else. Route handlers do not run layouts, so the
 * `(private)` gates never apply here.
 *
 * A running tab compares this against the stamp baked into its own bundle to
 * find out it is stale. That is the whole update check — no service worker (ours
 * has no `fetch` handler on purpose), no git tag, no database column.
 *
 * `force-dynamic` is redundant — GET route handlers have been dynamic by default
 * since Next 15 — but it says out loud that this must never be prerendered.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ build: BUILD_STAMP }, { headers: { 'cache-control': 'no-store' } });
}
