'use client';

import { paletteColor, resolveAvatarConfig } from '@vaquita/avatar';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { addUsdcTrustline } from '@/networks/stellar/sorobanTx';
import { Card } from '@heroui/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight, FiHeart, FiSettings, FiShare2, FiUserPlus } from 'react-icons/fi';
import {
  useClaimedAchievements,
  useDepositsComplete,
  useFollowCounts,
  useMapLikeCount,
  useProfileAchievements,
  useProfileData,
  useProfileExperience,
  useProfileRewards,
  useProfileStreak,
  type FollowListKind,
} from '../../hooks';
import { useConfigStore } from '../../stores';
import { buildAchievements } from '../../data/profile-badges';
import { PageLayout } from '../molecules';
import { VaquitaAvatar } from '../avatar/VaquitaAvatar';
import { BadgeTile } from './profile/BadgeTile';
import { FollowListModal } from './profile/FollowListModal';
import { ShareProfileQrButton } from './profile/ShareProfileQrButton';

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

const SectionHeader = ({
  title,
  count,
  href,
}: {
  title: string;
  count?: number;
  href?: string;
}) => {
  const { t } = useTranslation();
  const trailing = (
    <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-black transition">
      {typeof count === 'number' && <span className="tabular-nums">{count}</span>}
      <FiChevronRight className="h-4 w-4" />
    </span>
  );
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-500">
        {title}
      </h2>
      {href ? (
        <Link href={href} aria-label={t('profilePages.profile.seeAll', 'See all {{title}}', { title })}>
          {trailing}
        </Link>
      ) : (
        trailing
      )}
    </div>
  );
};

const StatPill = ({
  value,
  label,
  onPress,
  ariaLabel,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  onPress?: () => void;
  ariaLabel?: string;
}) => {
  const inner = (
    <>
      <span className="text-lg sm:text-xl font-extrabold text-black tabular-nums leading-none">
        {value}
      </span>
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </span>
    </>
  );
  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label={ariaLabel}
        className="flex flex-col items-center min-w-0 flex-1 rounded-xl py-1 bg-transparent hover:bg-black/5 transition"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex flex-col items-center min-w-0 flex-1">{inner}</div>;
};

const SummaryItem = ({
  icon,
  value,
  label,
}: {
  icon: string;
  value: React.ReactNode;
  label: string;
}) => (
  // Icono + número en una línea. La etiqueta queda sólo para lectores de
  // pantalla: el ícono ya dice qué es cada número y escribirlo al lado sumaba
  // ruido sin información.
  <div className="flex min-w-0 items-center justify-center gap-2 leading-tight">
    <Image
      src={icon}
      alt=""
      aria-hidden
      width={28}
      height={28}
      className="shrink-0 object-contain"
    />
    <span className="text-base font-extrabold text-black tabular-nums">{value}</span>
    <span className="sr-only">{label}</span>
  </div>
);

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { walletAddress } = useConfigStore();
  const { data: profileData } = useProfileData();
  const { data: streakData } = useProfileStreak();
  const { data: experienceData } = useProfileExperience();
  const { data: rewardsData } = useProfileRewards();
  const { data: depositsData } = useDepositsComplete(walletAddress);
  const { data: achievementsData } = useProfileAchievements();
  const { data: followCounts } = useFollowCounts();
  const { data: mapLikes } = useMapLikeCount();
  const [followModal, setFollowModal] = useState<{ open: boolean; tab: FollowListKind }>({
    open: false,
    tab: 'following',
  });
  // Mirrors the trophy room: the preview badges should show the same
  // "ready to claim" pulse so the cue is consistent across both screens.
  const { isClaimed } = useClaimedAchievements();

  // /profile?follow=<wallet> deep links are handled globally by
  // FollowLinkCapture / PendingFollowConsumer in the (private) layout, so
  // they survive the signup funnel for unregistered scanners.

  const totalStreak = (streakData?.yesterdayStreak || 0) + (streakData?.todayStreak ? 1 : 0);
  const hasActiveStreak = !!streakData?.todayStreak;
  const experience = experienceData?.experience ?? 0;
  const goldCoins = rewardsData?.rewards?.find((r) => r?.name === 'Gold Coin')?.amount ?? 0;
  const { activeDeposits, activeDepositsTotalAmount } = getDepositsData(depositsData?.deposits ?? []);
  const totalDeposits = activeDeposits?.length ?? 0;

  const displayName = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return nickname;
    const full = profileData?.fullName?.trim();
    if (full) return full;
    if (walletAddress) return `Vaquero ${walletAddress.slice(-4).toUpperCase()}`;
    return 'Vaquero';
  }, [profileData?.nickname, profileData?.fullName, walletAddress]);

  // Keep the handle exactly as the user typed it (no forced lowercase).
  const handle = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return `@${nickname.replace(/\s+/g, '')}`;
    if (walletAddress) return `@vaquero${walletAddress.slice(-4)}`;
    return '@vaquero';
  }, [profileData?.nickname, walletAddress]);

  // Real account creation date from the backend ("joined 5 May 2026"). Falls
  // back to the current date if the timestamp hasn't loaded yet.
  // Formatted with the APP's language, not the browser's: `undefined` here read
  // the OS locale, so a profile set to Spanish rendered "se unió el July 21".
  const joinedLabel = useMemo(() => {
    const createdAt = profileData?.createdAt;
    const date = createdAt ? new Date(createdAt) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [profileData?.createdAt, i18n.language]);

  // The banner floods the full page width with the avatar's own background
  // colour, so the character reads as part of the header instead of sitting in
  // a coloured box that stops at the artwork's edges.
  const bannerBackground = useMemo(() => {
    const config = resolveAvatarConfig(
      profileData?.avatarConfig,
      profileData?.walletAddress || walletAddress || ''
    );
    return paletteColor('background', config['backgroundColor'] as number);
  }, [profileData?.avatarConfig, profileData?.walletAddress, walletAddress]);

  const betaTester = useMemo(
    () => achievementsData?.achievements?.find((a) => a.key === 'beta-tester'),
    [achievementsData?.achievements]
  );

  const achievements = useMemo(
    () =>
      buildAchievements({
        totalStreak,
        totalDeposits,
        experience,
        totalSavedAmount: activeDepositsTotalAmount,
        isBetaTester: betaTester?.unlocked ?? false,
        betaTesterClaimedAt: betaTester?.claimedAt ?? undefined,
        extraAchievements: achievementsData?.achievements,
        friendsCount: followCounts?.following ?? 0,
      }),
    [totalStreak, totalDeposits, experience, activeDepositsTotalAmount, betaTester, achievementsData?.achievements, followCounts?.following]
  );

  // The 4-tile preview prioritises what the user can act on right now:
  // 1) achievements ready to claim (unlocked, not yet claimed),
  // 2) then ones already claimed (their earned trophies),
  // 3) the still-locked ones last, easiest-to-get first (closest to completion),
  //    so the grid never empties.
  // Within each bucket we keep the catalog's display order (already easy→hard).
  const previewBadges = useMemo(() => {
    const closeness = (b: (typeof achievements)[number]) =>
      b.progress && b.progress.target > 0 ? b.progress.current / b.progress.target : 0;

    const claimable = achievements.filter((b) => b.unlocked && !isClaimed(b.id));
    const claimed = achievements.filter((b) => b.unlocked && isClaimed(b.id));
    const locked = achievements
      .filter((b) => !b.unlocked)
      .sort((a, b) => closeness(b) - closeness(a));

    return [...claimable, ...claimed, ...locked].slice(0, 4);
  }, [achievements, isClaimed]);

  // Medallas conseguidas: el mismo número que muestra el encabezado de la
  // sección de logros, para que la tira de progreso y la sección no se
  // contradigan.
  const unlockedAchievements = useMemo(
    () => achievements.filter((b) => b.unlocked).length,
    [achievements],
  );

  /* -------------------------------------------------------------- */
  /* Disconnected state                                              */
  /* -------------------------------------------------------------- */
  if (!walletAddress) {
    return (
      <PageLayout title={t('profilePages.profile.title', 'Profile')} backHref="/home">
        <Card className="border border-default-200/60 bg-white/80 shadow-sm backdrop-blur dark:border-default-100/40 dark:bg-default-50/80">
          <Card.Content className="flex flex-col gap-6 p-6 sm:p-10 text-center">
            <div className="space-y-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50">
                {t('profilePages.profile.connectWalletTitle', 'Connect your wallet')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(
                  'profilePages.profile.connectWalletDescription',
                  'Access your profile, metrics, and future achievements by connecting your wallet.'
                )}
              </p>
            </div>
          </Card.Content>
        </Card>
      </PageLayout>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* gap-4, no gap-6: con 24px entre cada bloque la pantalla se leía como
          piezas sueltas flotando en el fondo en vez de un perfil. 16px las
          agrupa sin que se toquen; el respiro dentro de cada bloque (header →
          tarjeta) lo da su propio gap-3. */}
      {/* pb-20: sólo lo justo para que el nav flotante no tape la última
          tarjeta. Con pb-28 quedaba una franja vacía enorme al final. */}
      <div className="mx-auto w-full max-w-2xl pb-20 md:pb-8 flex flex-col gap-4">
        {/* Hero banner ------------------------------------------------ */}
        {/* The character IS the banner: it's drawn edge-to-edge at the top of
            the screen, cropped at the shoulders, with the avatar's own
            background colour flooding the full width behind it. The name
            overlays the top-left corner and the actions the top-right, so
            nothing competes with the face. Tapping anywhere on it opens the
            builder — the only way to change a profile picture. */}
        <header className="relative" style={{ backgroundColor: bannerBackground }}>
          <Link
            href="/profile/avatar"
            aria-label={t('profilePages.profile.editAvatarAria', 'Edit your avatar')}
            className="block pt-11"
          >
            <VaquitaAvatar
              config={profileData?.avatarConfig}
              seed={profileData?.walletAddress || walletAddress || ''}
              crop="bust"
              background={false}
              className="mx-auto block w-full max-w-[15.5rem] [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
            />
          </Link>

          {/* Overlay row — back left, title centred, actions right. All three
              cells are `flex-1 basis-0`, so the side groups claim equal width
              however wide their buttons are and the middle third lands on the
              page's centre line (a plain justify-between would push the title
              off-centre by the difference between one button and two).
              The wrapper ignores pointer events so the whole banner behind it
              stays tappable; each control opts back in. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-4 sm:px-6">
            <div className="pointer-events-auto flex flex-1 basis-0 justify-start">
              <Link
                href="/home"
                aria-label={t('common.back')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black border-b-2 bg-white/70 text-black transition hover:bg-white"
              >
                <FiChevronLeft className="h-5 w-5" />
              </Link>
            </div>
            {/* The screen title, not the username — the handle right below the
                banner already identifies who this is, and repeating it here
                just competed with the character. */}
            <h1 className="flex-1 basis-0 truncate text-center text-2xl font-extrabold tracking-tight text-black sm:text-3xl">
              {t('profilePages.profile.title', 'Profile')}
            </h1>
            {/* Sharing lives next to the "add friends" CTA further down, where
                it's an action rather than a header icon. */}
            <div className="pointer-events-auto flex flex-1 basis-0 shrink-0 items-center justify-end gap-2">
              <Link
                href="/profile/settings"
                aria-label={t('profilePages.profile.settingsAria', 'Settings')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black border-b-2 bg-white/70 text-black transition hover:bg-white"
              >
                <FiSettings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        {/* Handle + joined date sit on the page background, right under the
            banner — the same split as the reference design. */}
        <section className="-mt-2 px-4 sm:px-6">
          {/* No `uppercase` here: the handle has to read exactly as the user
              saved it (Lea, 4Test1234), and a CSS transform would rewrite it.
              The handle is wrapped in <b> inside the translation so each locale
              decides where it sits in the sentence — it's the identity on this
              screen, the join date is just context. */}
          <p className="text-xs font-bold tracking-wide text-gray-500 sm:text-sm">
            <Trans
              i18nKey="profilePages.profile.handleJoined"
              values={{ handle, joinedLabel }}
              components={{ b: <strong className="text-base font-extrabold text-black sm:text-lg" /> }}
            />
          </p>
        </section>

        {/* Stats row -------------------------------------------------- */}
        <section className="px-4 sm:px-6">
          <div className="flex items-stretch gap-3">
            <StatPill
              value={followCounts?.following ?? 0}
              label={t('profilePages.profile.following', 'Following')}
              ariaLabel={t('profilePages.profile.viewFollowing', 'View following')}
              onPress={() => setFollowModal({ open: true, tab: 'following' })}
            />
            <span className="w-px bg-black/10" aria-hidden />
            <StatPill
              value={followCounts?.followers ?? 0}
              label={t('profilePages.profile.followers', 'Followers')}
              ariaLabel={t('profilePages.profile.viewFollowers', 'View followers')}
              onPress={() => setFollowModal({ open: true, tab: 'followers' })}
            />
            <span className="w-px bg-black/10" aria-hidden />
            {/* Likes the user's 3D world collected. The heart rides with the
                label, not the number, so all three counts sit on one baseline
                and the icon reads as part of the caption. */}
            <StatPill
              value={mapLikes ?? 0}
              label={
                <>
                  <FiHeart className="h-3.5 w-3.5" aria-hidden />
                  {t('profilePages.profile.mapLikes', 'Likes')}
                </>
              }
            />
          </div>
        </section>

        {/* Friends CTA + share ---------------------------------------- */}
        {/* The QR sits beside the CTA, not in the banner: both are "grow your
            circle" actions, and pairing them frees the header for navigation. */}
        <section className="flex items-stretch gap-3 px-4 sm:px-6">
          <Link
            href="/profile/friends"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-black border-b-3 bg-white text-sm font-bold uppercase tracking-wide text-black transition hover:-translate-y-0.5 hover:bg-white/80"
          >
            <FiUserPlus className="h-4 w-4" />
            {t('profilePages.profile.addFriends', 'Add friends')}
          </Link>
          <ShareProfileQrButton
            displayName={displayName}
            handle={handle}
            avatarConfig={profileData?.avatarConfig}
            avatarSeed={profileData?.walletAddress || walletAddress || ''}
            className="h-12 w-12 rounded-md !bg-white hover:-translate-y-0.5 border-b-3"
          />
        </section>


        {/* Progreso --------------------------------------------------- */}
        {/* Tira de datos, no una sección navegable: son los cuatro números que
            el usuario va acumulando (racha, medallas, XP, oro) y se leen de un
            vistazo. Sin tarjeta blanca ni chevron a propósito — no lleva a
            ningún lado, así que nada acá debe parecer tocable. */}
        <section className="px-4 sm:px-6 flex flex-col gap-3">
          {/* Encabezado sin chevron ni contador: la tira no navega a ningún
              lado, solo necesita nombre para no quedar flotando entre los
              botones y Logros. */}
          <h2 className="px-1 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-500">
            {t('profilePages.profile.summary', 'Summary')}
          </h2>
          {/* 2x2 en vez de 4 en fila: a 320px cada columna quedaba en ~70px y
              los valores largos ("878 XP") se apretaban contra el label. */}
          <div className="grid grid-cols-2 gap-x-10 gap-y-4 py-1">
            <SummaryItem
              icon={hasActiveStreak ? '/icons/global/streak_face.png' : '/icons/global/streak_freeze_face.png'}
              value={t('profilePages.profile.daysCount', { count: totalStreak, defaultValue: '{{count}} days' })}
              label={t('profilePages.profile.streak', 'Streak')}
            />
            <SummaryItem
              icon="/icons/global/trophy.png"
              value={unlockedAchievements.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              // "Medallas", no "Logros": el encabezado de la sección de abajo
              // ya dice Logros y repetir la palabra a dos líneas de distancia
              // hacía leer los dos números como el mismo dato dos veces.
              label={t('profilePages.profile.badges', 'Badges')}
            />
            <SummaryItem
              icon="/icons/global/star.png"
              value={`${Math.floor(experience).toLocaleString(undefined, { maximumFractionDigits: 0 })} XP`}
              label={t('profilePages.profile.experience', 'Experience')}
            />
            <SummaryItem
              icon="/icons/global/coin.png"
              value={Math.floor(goldCoins).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              label={t('profilePages.profile.gold', 'Gold')}
            />
          </div>
        </section>

        {/* Achievements ---------------------------------------------- */}
        <section className="px-4 sm:px-6 flex flex-col gap-3">
          <SectionHeader
            title={t('profilePages.profile.achievements', 'Achievements')}
            count={unlockedAchievements}
            href="/profile/achievements"
          />
          {/* The badge tiles are real <button>s, so we can't wrap the card in
              an <a> without invalid nesting. Instead, we place an absolute
              Link layer behind the grid, and have each tile's onPress push to
              the same route so clicking a badge image also takes the user to
              the trophy room — claiming happens there, not from the profile
              preview. The grid layer is pointer-events-none (tiles re-enable
              their own) so padding/gap hovers and clicks reach the Link
              instead of dying on the grid wrapper. */}
          <div className="relative rounded-2xl bg-white border border-black border-b-2 p-4 transition hover:-translate-y-0.5">
            <Link
              href="/profile/achievements"
              aria-label={t('profilePages.profile.seeAllAchievements', 'See all achievements')}
              className="absolute inset-0 rounded-2xl z-0"
            />
            <div className="pointer-events-none relative z-10 grid grid-cols-4 gap-2 sm:gap-4 place-items-center">
              {previewBadges.map((badge) => (
                <BadgeTile
                  key={badge.id}
                  badge={badge}
                  claimable={(badge.claimState === 'pending_mint' || badge.unlocked) && !isClaimed(badge.id)}
                  onPress={() => router.push('/profile/achievements')}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <FollowListModal
        open={followModal.open}
        initialTab={followModal.tab}
        onOpenChange={(o) => setFollowModal((s) => ({ ...s, open: o }))}
      />
    </div>
  );
}
