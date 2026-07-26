'use client';

import { PageHeader } from '@/core-ui/components/molecules/PageHeader';
import { useSlidePage } from '@/core-ui/components/molecules/useSlidePage';
import { useDismissSuggestion, useFriendSuggestions, useToggleFollow } from '@/core-ui/hooks';
import type { FriendSuggestionDTO } from '@/core-ui/types';
import Link from 'next/link';
import React, { useState } from 'react';
import { VaquitaAvatarCircle } from '../../avatar/VaquitaAvatar';
import { useTranslation } from 'react-i18next';
import {
  FiBookOpen,
  FiChevronRight,
  FiLoader,
  FiSearch,
  FiShare2,
  FiX,
} from 'react-icons/fi';

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ActionRow({
  icon,
  label,
  onPress,
  href,
  disabled,
  soon,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  href?: string;
  disabled?: boolean;
  soon?: boolean;
}) {
  const { t } = useTranslation();
  // No card of its own: the three rows share one bordered container, separated
  // by hairlines, so the section reads as a single list instead of three
  // stacked white blocks.
  const inner = (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 transition ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[#FFF7E6]'
      }`}
    >
      {/* Sin recuadro celeste: era el único azul de toda la app y competía con
          el texto de la fila. El ícono solo ya distingue cada acción. */}
      <span className="flex h-8 w-8 items-center justify-center text-black shrink-0">
        {icon}
      </span>
      <p className="text-[15px] font-extrabold text-black flex-1 min-w-0 truncate">{label}</p>
      {soon && (
        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-black border border-black border-b-2 rounded-full px-2.5 py-0.5 shrink-0">
          {t('common.soon')}
        </span>
      )}
      <FiChevronRight className="text-gray-500 shrink-0" />
    </div>
  );

  if (disabled) return <div aria-disabled="true">{inner}</div>;
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return (
    <button type="button" onClick={onPress} className="block w-full text-left bg-transparent">
      {inner}
    </button>
  );
}

function SuggestionCard({
  suggestion,
  followed,
  loading,
  onToggleFollow,
  onDismiss,
}: {
  suggestion: FriendSuggestionDTO;
  followed: boolean;
  loading: boolean;
  onToggleFollow: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative shrink-0 w-40 sm:w-44 rounded-2xl border border-black border-b-2 bg-white p-3 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('social.friends.dismissSuggestion')}
        className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-black hover:bg-black/5 transition bg-transparent"
      >
        <FiX className="h-3.5 w-3.5" />
      </button>

      <VaquitaAvatarCircle
        config={suggestion.avatarConfig}
        seed={suggestion.walletAddress}
        alt={suggestion.name}
        className="mt-1 h-16 w-16 border-2 border-b-4"
      />

      <div className="text-center min-w-0 w-full px-1">
        <p className="text-sm font-extrabold text-black truncate">{suggestion.name}</p>
        <p className="text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2">
          {suggestion.followedBy ? (
            <>
              {t('social.friends.followedBy')}{' '}
              <span className="font-semibold text-gray-600">{suggestion.followedBy}</span>
            </>
          ) : (
            t('social.friends.suggestedForYou')
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onToggleFollow}
        disabled={loading}
        aria-busy={loading}
        aria-pressed={followed}
        className={`mt-1 w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider border border-black border-b-3 transition ${
          loading ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5'
        } ${
          followed ? 'bg-white text-black hover:bg-white/80' : 'bg-primary text-black hover:bg-primary/80'
        }`}
      >
        {loading && <FiLoader className="h-3 w-3 animate-spin" />}
        {followed ? t('social.friends.following') : t('social.friends.follow')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * `onBack` lo pasa <FriendsModal> cuando la pantalla se abre como panel sobre
 * el perfil: ahí el cierre y la animación los maneja el modal. Sin él, la
 * pantalla funciona como ruta suelta (/profile/friends, entrada directa o
 * enlace compartido) y se anima sola con useSlidePage.
 */
export function FriendsPage({
  onBack,
  onOpenSearch,
}: { onBack?: () => void; onOpenSearch?: () => void } = {}) {
  const { t } = useTranslation();
  const { data, isLoading } = useFriendSuggestions();
  const toggleFollow = useToggleFollow();
  const dismissSuggestion = useDismissSuggestion();

  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);

  const visibleSuggestions = data?.suggestions ?? [];

  const handleToggleFollow = (wallet: string) => {
    const isFollowing = following.has(wallet);
    // Optimistically flip the button; roll back on error.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(wallet);
      else next.add(wallet);
      return next;
    });
    setPendingWallet(wallet);
    toggleFollow.mutate(
      { targetWallet: wallet, isFollowing },
      {
        onError: () => {
          setFollowing((prev) => {
            const next = new Set(prev);
            if (isFollowing) next.add(wallet);
            else next.delete(wallet);
            return next;
          });
        },
        onSettled: () => setPendingWallet(null),
      },
    );
  };

  // Sólo para el modo ruta suelta: como panel, quien anima es <FriendsModal>
  // (aplicar las dos animaciones a la vez hacía que la pantalla entrara dos
  // veces).
  const { className: slideClassName, goBack } = useSlidePage('/profile');
  const asPanel = !!onBack;

  // "Not interested": the hook removes the card optimistically, persists the
  // dismissal (survives F5), and refetches the rail to backfill a fresh one.
  const dismiss = (wallet: string) => dismissSuggestion.mutate(wallet);

  return (
    <div className={`h-full overflow-y-auto bg-background ${asPanel ? '' : slideClassName}`}>
      {/* pt-4 + gap-4: antes el encabezado arrancaba a 20-24px del borde y
          dejaba otros 20 hasta la primera tarjeta, así que la pantalla abría
          con un hueco antes de cualquier contenido. */}
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-4 pb-12 flex flex-col gap-4">
        <PageHeader
          title={t('social.friends.title')}
          onBack={onBack ?? goBack}
          // Como panel apilado el botón cierra el modal, no retrocede: X en vez de flecha.
          leftIcon={asPanel ? 'close' : 'back'}
        />

        {/* Find actions — one card, three rows */}
        <section className="overflow-hidden rounded-2xl border border-black border-b-2 bg-white divide-y divide-black/10">
          {/* Search is the only path that works today, so it leads. Contacts
              import and the share link aren't built yet: inert rows rather
              than screens that only say "soon" again. */}
          {/* Como panel apilado (onOpenSearch) abre la búsqueda como sub-panel
              sin desmontar; como ruta suelta sigue siendo un <Link> a la ruta. */}
          <ActionRow
            icon={<FiSearch className="h-5 w-5" />}
            label={t('social.friends.searchByName')}
            {...(onOpenSearch ? { onPress: onOpenSearch } : { href: '/profile/friends/search' })}
          />
          <ActionRow
            icon={<FiBookOpen className="h-5 w-5" />}
            label={t('social.friends.chooseFromContacts')}
            disabled
            soon
          />
          <ActionRow
            icon={<FiShare2 className="h-5 w-5" />}
            label={t('social.friends.shareFollowLink')}
            disabled
            soon
          />
        </section>

        {/* Friend suggestions */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base sm:text-lg font-extrabold text-black">
              {t('social.friends.suggestionsTitle')}
            </h2>
          </div>

          {isLoading ? (
            <div className="flex gap-3 overflow-hidden" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="shrink-0 w-40 sm:w-44 h-[164px] rounded-2xl border border-black border-b-2 bg-white animate-pulse"
                />
              ))}
            </div>
          ) : visibleSuggestions.length === 0 ? (
            <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
              <p className="text-sm font-semibold text-black">
                {t('social.friends.emptyTitle')}
              </p>
              <p className="text-xs text-gray-500 mt-1">{t('social.friends.emptyBody')}</p>
            </div>
          ) : (
            // Bleed the carousel out to the viewport edges and re-add the page
            // padding inside as scroll padding. That way snap-start lands the
            // first card flush with the content gutter instead of leaving it
            // half-cropped behind the page padding.
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 scroll-px-4 sm:scroll-px-6 no-scrollbar snap-x snap-mandatory"
              aria-label={t('social.friends.suggestionsTitle')}
            >
              {visibleSuggestions.map((s) => (
                <div key={s.walletAddress} className="snap-start">
                  <SuggestionCard
                    suggestion={s}
                    followed={following.has(s.walletAddress)}
                    loading={pendingWallet === s.walletAddress}
                    onToggleFollow={() => handleToggleFollow(s.walletAddress)}
                    onDismiss={() => dismiss(s.walletAddress)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
