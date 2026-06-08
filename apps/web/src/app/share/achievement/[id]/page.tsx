import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCatalogAchievement } from '@/core-ui/data/achievement-catalog';

/**
 * Public share page for achievements. Two jobs:
 *
 *  1. Be the landing visitors hit when someone taps a shared link in X /
 *     WhatsApp / Telegram / etc. — renders the badge plus a CTA back to
 *     the app.
 *  2. Declare Open Graph + Twitter Card metadata so the same link, when
 *     pasted anywhere, unfurls with the server-rendered image produced by
 *     `/og/achievement/[id]/route.tsx`. This is what makes the share flow
 *     "image-rich" without ever generating a PNG on the client.
 *
 * URL: `/share/achievement/<id>?u=<username>&date=<iso-date>`
 *
 * Query params (all optional):
 *  - `u`     username to print on the OG image and the page.
 *  - `date`  ISO date string for the unlock date. Both the OG image and
 *            the page format it as "MMM D, YYYY".
 *
 * NOTE: this is mocked end-to-end. The achievement catalog is local
 *  (`achievement-catalog.ts`), so any user can land here without auth and
 *  see the badge. When the backend ships a real catalog and user lookup,
 *  swap `getCatalogAchievement` for a server-side fetch and (optionally)
 *  resolve the username from a public profile endpoint.
 */

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ u?: string; date?: string }>;
};

/** Build the absolute origin from the incoming request headers. Lets the
 *  share page work on `localhost:3101`, preview deploys, and production
 *  without an explicit `NEXT_PUBLIC_APP_URL` env var. */
const resolveOrigin = async (): Promise<string> => {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return host ? `${proto}://${host}` : 'http://localhost:3101';
};

const formatDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const { u, date } = await searchParams;
  const achievement = await getCatalogAchievement(id);
  // Public, server-rendered unfurl/OG page: it has no signed-in profile to read
  // a locale from and must stay consistent for crawlers, so it renders in the
  // source language (English) rather than the client i18n runtime.
  if (!achievement) return { title: 'Achievement · Vaquita' };

  const origin = await resolveOrigin();
  const ogQuery = new URLSearchParams();
  if (u) ogQuery.set('u', u);
  if (date) ogQuery.set('date', date);
  const qs = ogQuery.toString();
  const ogImageUrl = `${origin}/og/achievement/${id}${qs ? `?${qs}` : ''}`;

  const achievementTitle = achievement.title;
  const achievementDescription = achievement.description;

  const title = `${achievementTitle} · Vaquita`;
  const description = u
    ? `@${u} just unlocked "${achievementTitle}" on Vaquita. ${achievementDescription}`
    : `Someone just unlocked "${achievementTitle}" on Vaquita. ${achievementDescription}`;

  return {
    // metadataBase resolves any future relative URLs (icons, manifest, …).
    // Set per-page since the root layout doesn't declare one.
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${origin}/share/achievement/${id}${qs ? `?${qs}` : ''}`,
      siteName: 'Vaquita',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: achievementTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
    // Personalized variants don't need to flood the index.
    robots: u ? { index: false, follow: true } : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function SharedAchievementPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { u: username, date } = await searchParams;
  const achievement = await getCatalogAchievement(id);
  if (!achievement) notFound();

  const formattedDate = formatDate(date);
  const achievementTitle = achievement.title;
  const achievementDescription = achievement.description;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-background px-6 py-12">
      <article className="relative w-full max-w-md mx-auto rounded-3xl overflow-hidden bg-white border border-black border-b-2 shadow-lg">
        <div className="flex flex-col items-center text-center px-6 pt-7 pb-6 gap-3">
          <div className="relative flex h-40 w-40 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-4 rounded-full blur-2xl opacity-50"
              style={{ background: achievement.accent }}
            />
            <Image
              src={achievement.icon}
              alt={achievementTitle}
              fill
              sizes="160px"
              className="relative object-contain drop-shadow-md"
              priority
            />
          </div>

          {formattedDate && (
            <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider bg-primary/30 text-[#7A3E00] rounded-full px-3 py-1">
              {formattedDate}
            </span>
          )}

          <p className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
            Achievement unlocked
          </p>
          <h1 className="text-2xl font-extrabold text-black leading-tight">{achievementTitle}</h1>
          {username && (
            <p className="text-sm font-semibold text-gray-700">
              earned by @{username}
            </p>
          )}
          <p className="text-sm text-gray-600 leading-snug max-w-[18rem]">
            {achievementDescription}
          </p>

          <div className="mt-3 flex items-center gap-2 border-t border-black/10 pt-4 w-full justify-center">
            <Image
              src="/vaquita/vaquita_isotipo.svg"
              alt=""
              width={40}
              height={40}
              className="object-contain"
            />
            <span className="text-base font-extrabold tracking-tight text-black">Vaquita</span>
          </div>
        </div>
      </article>

      <Link
        href="/profile/achievements"
        className="mt-8 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-bold uppercase tracking-wide transition shadow-sm hover:-translate-y-0.5"
      >
        Earn your own on Vaquita
      </Link>
    </main>
  );
}
