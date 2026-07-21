import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getCatalogAchievement } from '@/core-ui/data/achievement-catalog';

/**
 * Open Graph image endpoint for shared achievements.
 *
 * Renders the achievement card as a PNG. Two formats:
 *  - default: 1200×630 — picked up by social platforms (X, WhatsApp, Telegram,
 *    Slack, …) from the `/share/achievement/[id]` page's
 *    `<meta property="og:image">`.
 *  - `format=story`: 1080×1920 (9:16) — fetched by the in-app share button and
 *    attached as a `File` to `navigator.share`, so image-first targets like
 *    Instagram Stories get a full-bleed card with no cropping.
 *
 * URL: `/og/achievement/<id>?u=<username>&date=<iso-date>&format=<og|story>`
 *
 * Query params (all optional — used for personalization):
 *  - `u`      username to print on the card (e.g. `alex` → "· @alex").
 *  - `date`   ISO date string for when the badge was unlocked. Formatted as
 *             "MMM D, YYYY" to match the in-app pill.
 *  - `format` `story` for the 9:16 variant; anything else → 1200×630.
 *
 * Caching: served as a static asset (`Cache-Control: public, immutable`) keyed
 *  by the full query string, so each (id, username, date, format) combo gets
 *  cached once at the edge.
 *
 * Backend hookup (later): swap `getCatalogAchievement` for a real catalog
 *  fetch. The component tree below stays the same — it only consumes
 *  `{ title, description, icon, accent }`.
 */

// Force the Node runtime — `next/og` works on edge too, but the Node runtime
// is friendlier when this route eventually needs to call internal APIs or
// read fonts from `apps/web/public`.
export const runtime = 'nodejs';

const OG_SIZE = { width: 1200, height: 630 } as const;
const STORY_SIZE = { width: 1080, height: 1920 } as const;
const DEFAULT_ACCENT = 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)';

/**
 * Rubik — the app's UI font (`--font-sans` in globals.css) — embedded so the
 * card typography matches the in-app badge view exactly. Satori only takes
 * ttf/otf/woff (no woff2); the .woff files live in `public/fonts/` (copied
 * from @fontsource/rubik) so they ship inside the standalone Docker image.
 * Weights mirror the Tailwind classes used in-app: 400 body, 600 semibold
 * byline, 800 extrabold headings.
 */
const FONT_WEIGHTS = [400, 600, 800] as const;
let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 800; style: 'normal' }[]> | null = null;
const loadFonts = () => {
  fontsPromise ??= Promise.all(
    FONT_WEIGHTS.map(async (weight) => ({
      name: 'Rubik',
      data: await readFile(path.join(process.cwd(), 'public', 'fonts', `rubik-latin-${weight}-normal.woff`)),
      weight,
      style: 'normal' as const,
    })),
  );
  return fontsPromise;
};

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/**
 * Resolve an image to a base64 data URI so satori never has to fetch it over
 * HTTP. Self-fetching the public origin fails in deployed containers (hairpin
 * DNS / proxy TLS), which silently dropped the badge icon from the card.
 *
 * Local assets (`/icons/...`) are read straight from `public/`; absolute URLs
 * (admin-created badges on object storage) are fetched and inlined. Returns
 * null on any failure — the card renders without the image instead of 500ing.
 */
async function loadImageDataUri(src: string, origin: string): Promise<string | null> {
  try {
    if (src.startsWith('/')) {
      const clean = src.split(/[?#]/)[0];
      const publicDir = path.join(process.cwd(), 'public');
      const filePath = path.normalize(path.join(publicDir, clean));
      // Catalog data can come from the backend — never let it escape public/.
      if (!filePath.startsWith(publicDir + path.sep)) return null;
      const buf = await readFile(filePath);
      const mime = MIME_BY_EXT[path.extname(clean).toLowerCase()] ?? 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
    const res = await fetch(new URL(src, origin));
    if (!res.ok) return null;
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // UTC keeps the card deterministic — otherwise the printed day depends on
  // the server's timezone for midnight-UTC timestamps.
  return d
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const achievement = await getCatalogAchievement(id);
  if (!achievement) {
    return new Response('Achievement not found', { status: 404 });
  }

  const url = new URL(req.url);
  const username = url.searchParams.get('u');
  const date = formatDate(url.searchParams.get('date'));
  const story = url.searchParams.get('format') === 'story';

  const origin = req.nextUrl.origin;
  const [iconUrl, logoUrl, fonts] = await Promise.all([
    loadImageDataUri(achievement.icon, origin),
    loadImageDataUri('/vaquita/vaquita_isotipo.svg', origin),
    loadFonts(),
  ]);
  const accent = achievement.accent ?? DEFAULT_ACCENT;

  const size = story ? STORY_SIZE : OG_SIZE;
  // Same card, two layouts: the story variant stacks everything in a tall
  // centered column; the landscape OG variant puts the icon beside the text
  // so the content fits 630px of height.
  const dims = story
    ? {
        outerPad: '80px 56px',
        cardPad: '96px 64px',
        cardRadius: '56px',
        gap: 36,
        icon: 460,
        haloInset: 40,
        pill: 34,
        kicker: 34,
        title: 92,
        earnedBy: 38,
        desc: 42,
        descMax: 840,
        footer: 52,
        logo: 80,
      }
    : {
        outerPad: '56px 64px',
        cardPad: '40px 72px',
        cardRadius: '40px',
        gap: 16,
        icon: 260,
        haloInset: 24,
        pill: 20,
        kicker: 20,
        title: 60,
        earnedBy: 24,
        desc: 26,
        descMax: 560,
        footer: 36,
        logo: 56,
      };

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
          padding: dims.outerPad,
          fontFamily: 'Rubik, sans-serif',
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
            borderRadius: dims.cardRadius,
            border: '2px solid #000000',
            boxShadow: '0 8px 0 rgba(0, 0, 0, 0.08)',
            padding: dims.cardPad,
            gap: dims.gap,
            position: 'relative',
          }}
        >
          {/* Main content: column (story) or icon-beside-text row (landscape) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: story ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              gap: story ? dims.gap : 56,
            }}
          >
            {/* Icon with halo */}
            <div
              style={{
                position: 'relative',
                width: dims.icon,
                height: dims.icon,
                display: 'flex',
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: dims.haloInset,
                  left: dims.haloInset,
                  right: dims.haloInset,
                  bottom: dims.haloInset,
                  borderRadius: '9999px',
                  background: accent,
                  opacity: 0.55,
                  filter: 'blur(40px)',
                }}
              />
              {iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={iconUrl}
                  alt={achievement.title}
                  width={dims.icon}
                  height={dims.icon}
                  style={{ position: 'relative', objectFit: 'contain' }}
                />
              )}
            </div>

            {/* Text block */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: story ? 'center' : 'flex-start',
                gap: dims.gap,
              }}
            >
              {/* Date pill */}
              {date && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 214, 74, 0.35)',
                    color: '#7A3E00',
                    fontSize: dims.pill,
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
                  fontSize: dims.kicker,
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
                  fontSize: dims.title,
                  fontWeight: 800,
                  color: '#000000',
                  textAlign: story ? 'center' : 'left',
                  lineHeight: 1.05,
                }}
              >
                {achievement.title}
              </div>

              {/* Earned-by byline — mirrors the share landing page */}
              {username && (
                <div
                  style={{
                    display: 'flex',
                    fontSize: dims.earnedBy,
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  earned by @{username}
                </div>
              )}

              {/* Description */}
              <div
                style={{
                  display: 'flex',
                  fontSize: dims.desc,
                  color: '#4B5563',
                  textAlign: story ? 'center' : 'left',
                  maxWidth: dims.descMax,
                  lineHeight: 1.35,
                }}
              >
                {achievement.description}
              </div>
            </div>
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
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" width={dims.logo} height={dims.logo} />
            )}
            <div style={{ display: 'flex', fontSize: dims.footer, fontWeight: 800, color: '#000000' }}>
              Vaquita
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
      headers: {
        // Long edge cache: the OG image is deterministic for a given (id, u,
        // date, format) tuple. Bumping the design only requires deploying —
        // the URL contents change because the response body changes.
        'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      },
    },
  );
}
