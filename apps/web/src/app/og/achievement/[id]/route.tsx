import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getCatalogAchievement } from '@/core-ui/data/achievement-catalog';

/**
 * Open Graph image endpoint for shared achievements.
 *
 * Renders a 1200×630 PNG card that social platforms (X, WhatsApp, Telegram,
 * Slack, Instagram link previews, …) pick up from the `/share/achievement/[id]`
 * page's `<meta property="og:image">`. Replaces the client-side `html-to-image`
 * snapshot flow we used to run inside `AchievementModal`.
 *
 * URL: `/og/achievement/<id>?u=<username>&date=<iso-date>`
 *
 * Query params (all optional — used for personalization):
 *  - `u`     username to print on the card (e.g. `alex` → "by @alex").
 *  - `date`  ISO date string for when the badge was unlocked. Formatted as
 *            "MMM D, YYYY" to match the in-app pill.
 *
 * Caching: served as a static asset (`Cache-Control: public, immutable`) keyed
 *  by the full query string, so each (id, username, date) combo gets cached
 *  once at the edge.
 *
 * Backend hookup (later): swap `getCatalogAchievement` for a real catalog
 *  fetch. The component tree below stays the same — it only consumes
 *  `{ title, description, icon, accent }`.
 */

// Force the Node runtime — `next/og` works on edge too, but the Node runtime
// is friendlier when this route eventually needs to call internal APIs or
// read fonts from `apps/web/public`.
export const runtime = 'nodejs';

const SIZE = { width: 1200, height: 630 } as const;
const DEFAULT_ACCENT = 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)';

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    .toUpperCase();
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const achievement = getCatalogAchievement(id);
  if (!achievement) {
    return new Response('Achievement not found', { status: 404 });
  }

  const url = new URL(req.url);
  const username = url.searchParams.get('u');
  const date = formatDate(url.searchParams.get('date'));

  // Absolute origin so `<img src>` resolves correctly when satori fetches
  // the asset during render. `req.nextUrl.origin` honors the deployed host.
  const origin = req.nextUrl.origin;
  const iconUrl = new URL(achievement.icon, origin).toString();
  const logoUrl = new URL('/vaquita/vaquita_isotipo.svg', origin).toString();
  const accent = achievement.accent ?? DEFAULT_ACCENT;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FBF6E9',
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255, 214, 74, 0.25), transparent 60%), radial-gradient(circle at 80% 80%, rgba(245, 161, 97, 0.18), transparent 55%)',
          padding: '64px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            backgroundColor: '#FFFFFF',
            borderRadius: '40px',
            border: '2px solid #000000',
            boxShadow: '0 8px 0 rgba(0, 0, 0, 0.08)',
            padding: '56px 72px',
            gap: '24px',
            position: 'relative',
          }}
        >
          {/* Icon with halo */}
          <div
            style={{
              position: 'relative',
              width: 280,
              height: 280,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 24,
                left: 24,
                right: 24,
                bottom: 24,
                borderRadius: '9999px',
                background: accent,
                opacity: 0.55,
                filter: 'blur(40px)',
              }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconUrl}
              alt={achievement.title}
              width={280}
              height={280}
              style={{ position: 'relative', objectFit: 'contain' }}
            />
          </div>

          {/* Date pill */}
          {date && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 214, 74, 0.35)',
                color: '#7A3E00',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 2,
                padding: '8px 20px',
                borderRadius: '9999px',
              }}
            >
              {date}
            </div>
          )}

          {/* Kicker */}
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 2,
              color: '#F5A161',
              textTransform: 'uppercase',
            }}
          >
            Achievement unlocked
          </div>

          {/* Title */}
          <div
            style={{
              display: 'flex',
              fontSize: 72,
              fontWeight: 900,
              color: '#000000',
              textAlign: 'center',
              lineHeight: 1.05,
            }}
          >
            {achievement.title}
          </div>

          {/* Description */}
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#4B5563',
              textAlign: 'center',
              maxWidth: 760,
              lineHeight: 1.35,
            }}
          >
            {achievement.description}
          </div>

          {/* Footer lockup */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginTop: 'auto',
              paddingTop: 24,
              borderTop: '1px solid rgba(0, 0, 0, 0.1)',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" width={56} height={56} />
            <div style={{ display: 'flex', fontSize: 36, fontWeight: 900, color: '#000000' }}>
              Vaquita
            </div>
            {username && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 28,
                  fontWeight: 600,
                  color: '#6B7280',
                  marginLeft: 8,
                }}
              >
                · @{username}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: {
        // Long edge cache: the OG image is deterministic for a given (id, u,
        // date) tuple. Bumping the design only requires deploying — the URL
        // contents change because the response body changes.
        'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    },
  );
}
