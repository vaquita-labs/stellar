'use client';

import { useSearchFriends, useToggleFollow } from '@/core-ui/hooks';
import type { FriendDTO } from '@/core-ui/types';
import Image from 'next/image';
import React, { useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiLoader, FiSearch, FiUserPlus } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

export function SearchFriendsPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const { data, isLoading, isError, isFetching } = useSearchFriends(deferredQuery);
  const toggleFollow = useToggleFollow();

  // The wallet whose Follow button is mid-flight. Kept until BOTH the mutation
  // and the search refetch it triggers (onSettled invalidates the list) have
  // settled, so the spinner spans the full follow → re-fetch round trip.
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  useEffect(() => {
    if (pendingWallet && !toggleFollow.isPending && !isFetching) {
      setPendingWallet(null);
    }
  }, [pendingWallet, toggleFollow.isPending, isFetching]);

  const onToggleFollow = (friend: FriendDTO) => {
    setPendingWallet(friend.walletAddress);
    toggleFollow.mutate({ targetWallet: friend.walletAddress, isFollowing: friend.isFollowing });
  };

  const results: FriendDTO[] = data?.results ?? [];
  const hasQuery = query.trim().length > 0;

  return (
    <MockedSubPageLayout
      title={t('social.search.title')}
      subtitle={t('social.search.subtitle')}
      backHref="/profile/friends"
      showSoonBadge={false}
    >
      {/* Search */}
      <div className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4" />
        <input
          type="search"
          inputMode="search"
          autoFocus
          placeholder={t('social.search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-12 pl-10 pr-3 rounded-md bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
            {hasQuery ? t('social.search.resultsHeading') : t('social.search.popularHeading')}
            {/* Loader while a search is in flight (placeholderData keeps the old
                results on screen, so isLoading is only true on first load). */}
            {isFetching && !isLoading && (
              <FiLoader
                className="h-3 w-3 animate-spin text-gray-400"
                aria-label={t('social.search.searching')}
              />
            )}
          </h2>
          <span className="text-[11px] font-bold text-gray-500 tabular-nums">
            {results.length}
          </span>
        </div>

        {isLoading ? (
          <ul className="flex flex-col gap-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="h-[84px] rounded-2xl border border-black border-b-2 bg-white animate-pulse"
              />
            ))}
          </ul>
        ) : isError ? (
          <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
            <p className="text-sm font-bold text-black">{t('social.search.errorTitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('social.search.errorBody')}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-2xl border border-black border-b-2 bg-white p-6 text-center">
            <p className="text-sm font-bold text-black">
              {hasQuery
                ? t('social.search.noMatchQuery', { query })
                : t('social.search.noneYetTitle')}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {hasQuery ? t('social.search.noMatchBody') : t('social.search.noneYetBody')}
            </p>
          </div>
        ) : (
          <ul
            className={`flex flex-col gap-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}
            aria-busy={isFetching}
          >
            {results.map((v) => (
              <li
                key={v.walletAddress}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-black border-b-2 bg-white"
              >
                <div className="relative h-12 w-12 rounded-full bg-[#FFE7C7] border-2 border-black flex items-center justify-center overflow-hidden shrink-0">
                  {v.avatarUrl ? (
                    // Real uploaded photo: fill the circle (object-cover), same as ProfilePage.
                    <Image
                      src={v.avatarUrl}
                      alt={v.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <Image
                      src="/vaquita/vaquita_isotipo.svg"
                      alt={v.name}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-black truncate">{v.name}</p>
                  <p className="text-xs text-gray-500 truncate">{v.handle}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-[#DDF4FF] border border-[#84D8FF] text-black rounded-sm px-1.5 py-0.5">
                      {t('social.search.levelBadge', { level: v.level })}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/30 border border-black/30 text-black rounded-sm px-1.5 py-0.5">
                      🔥 {v.streak}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {t('social.search.followers', { count: v.followers })}
                    </span>
                  </div>
                </div>
                {(() => {
                  const isRowLoading = pendingWallet === v.walletAddress;
                  return (
                    <button
                      type="button"
                      onClick={() => onToggleFollow(v)}
                      disabled={isRowLoading}
                      aria-busy={isRowLoading}
                      className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-extrabold uppercase tracking-wider border border-black border-b-2 transition shrink-0 ${
                        isRowLoading ? 'opacity-70 cursor-wait' : 'hover:-translate-y-0.5'
                      } ${
                        v.isFollowing
                          ? 'bg-white text-black hover:bg-white/80'
                          : 'bg-primary text-black hover:bg-primary/80'
                      }`}
                      aria-pressed={v.isFollowing}
                    >
                      {isRowLoading ? (
                        <>
                          <FiLoader className="h-3.5 w-3.5 animate-spin" />
                          {v.isFollowing ? t('social.search.following') : t('social.search.follow')}
                        </>
                      ) : v.isFollowing ? (
                        <>
                          <FiCheck className="h-3.5 w-3.5" />
                          {t('social.search.following')}
                        </>
                      ) : (
                        <>
                          <FiUserPlus className="h-3.5 w-3.5" />
                          {t('social.search.follow')}
                        </>
                      )}
                    </button>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </MockedSubPageLayout>
  );
}
