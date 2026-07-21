'use client';

import { MIN_SEARCH_LENGTH, useSearchFriends, useToggleFollow } from '@/core-ui/hooks';
import type { FriendDTO } from '@/core-ui/types';
import Image from 'next/image';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiLoader, FiSearch, FiUserPlus, FiX } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

/** Idle time after the last keystroke before the search actually fires. */
const DEBOUNCE_MS = 450;

export function SearchFriendsPage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  // What we actually search for: the typed text once it settles (or right away
  // when the user submits with Enter / the keyboard's search key).
  const [submittedQuery, setSubmittedQuery] = useState('');

  useEffect(() => {
    if (query === submittedQuery) return;
    const id = setTimeout(() => setSubmittedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, submittedQuery]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
    inputRef.current?.blur(); // dismiss the mobile keyboard so results are visible
  };

  const { data, isError, isFetching } = useSearchFriends(submittedQuery);
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

  const term = submittedQuery.trim();
  const hasQuery = term.length >= MIN_SEARCH_LENGTH;
  // Whatever we already have stays on screen — including the previous term's
  // page while a new one loads — so found vaqueros never blink away. The
  // trailing spinner is what says "still looking".
  const results: FriendDTO[] = hasQuery ? (data?.results ?? []) : [];
  // Typed something that hasn't been answered yet: still debouncing, still
  // fetching, or `data` still holds the previous term's page.
  const isPending = hasQuery && (query.trim() !== term || isFetching || data?.query.trim() !== term);

  return (
    <MockedSubPageLayout title={t('social.search.title')} backHref="/profile/friends" showSoonBadge={false}>
      {/* Search. Submitting (Enter / the keyboard's search key) runs it now;
          otherwise it runs on its own once typing settles. */}
      <form role="search" onSubmit={onSubmit} className="relative">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoFocus
          placeholder={t('social.search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // The last utility hides Safari/Chrome's own ✕ glyph so we can render
          // our own icon button instead.
          className="w-full h-12 pl-10 pr-10 rounded-md bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSubmittedQuery('');
              inputRef.current?.focus();
            }}
            aria-label={t('common.clear')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition"
          >
            <FiX className="h-4 w-4" />
          </button>
        )}
      </form>

      <section className="flex flex-1 flex-col">
        {!hasQuery ? (
          // Idle: nothing typed yet (or only one letter, which we don't search).
          <div className="flex flex-1 flex-col items-center justify-center text-center px-6 pb-16">
            <Image src="/vaquita/moods/normal.png" alt="" width={96} height={96} className="w-24 h-24 object-contain" />
            <p className="text-sm font-bold text-black mt-3">{t('social.search.idleTitle')}</p>
            <p className="text-xs text-gray-500 mt-1">{t('social.search.idleBody')}</p>
          </div>
        ) : (
          <>
            {results.length === 0 && isPending ? (
              // Skeleton mirrors a real row (avatar + username + Follow pill) so
              // the list doesn't jump when the results land.
              <ul className="flex flex-col animate-pulse" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <div className="h-10 w-10 rounded-full bg-black/10 shrink-0" />
                    <div className="h-3.5 rounded-full bg-black/10" style={{ width: `${[7, 5.5, 8, 6, 6.5][i]}rem` }} />
                    <div className="ml-auto h-7 w-24 rounded-full bg-black/10 shrink-0" />
                  </li>
                ))}
              </ul>
            ) : isError ? (
              // flex-1 + justify-center: sits in the middle of whatever screen
              // space is left under the search box, not glued to it.
              <div className="flex flex-1 flex-col items-center justify-center text-center px-6 pb-16">
                <Image src="/vaquita/moods/serious.png" alt="" width={96} height={96} className="w-24 h-24 object-contain" />
                <p className="text-sm font-bold text-black mt-3">{t('social.search.errorTitle')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('social.search.errorBody')}</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center px-6 pb-16">
                <Image src="/vaquita/moods/sad.png" alt="" width={96} height={96} className="w-24 h-24 object-contain" />
                <p className="text-sm font-bold text-black mt-3">{t('social.search.noMatchTitle')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('social.search.noMatchBody')}</p>
              </div>
            ) : (
              <ul className="flex flex-col" aria-busy={isPending}>
                {results.map((v) => (
                  <li key={v.walletAddress} className="flex items-center gap-3 py-2.5">
                    <div className="relative h-10 w-10 rounded-full bg-[#FFE7C7] border-2 border-black flex items-center justify-center overflow-hidden shrink-0">
                      {v.avatarUrl ? (
                        // Real uploaded photo: fill the circle (object-cover), same as ProfilePage.
                        <Image src={v.avatarUrl} alt={v.handle} fill sizes="40px" className="object-cover" />
                      ) : (
                        <Image
                          src="/vaquita/vaquita_isotipo.svg"
                          alt={v.handle}
                          width={32}
                          height={32}
                          className="object-contain"
                        />
                      )}
                    </div>
                    <p className="flex-1 min-w-0 text-sm font-extrabold text-black truncate">{v.handle}</p>
                    {(() => {
                      const isRowLoading = pendingWallet === v.walletAddress;
                      return (
                        <button
                          type="button"
                          onClick={() => onToggleFollow(v)}
                          disabled={isRowLoading}
                          aria-busy={isRowLoading}
                          className={`h-7 px-2.5 inline-flex items-center gap-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border border-black transition shrink-0 ${
                            isRowLoading ? 'opacity-70 cursor-wait' : 'active:scale-95'
                          } ${
                            v.isFollowing
                              ? 'bg-transparent text-black hover:bg-black/5'
                              : 'bg-primary text-black hover:bg-primary/80'
                          }`}
                          aria-pressed={v.isFollowing}
                        >
                          {isRowLoading ? (
                            <FiLoader className="h-3 w-3 animate-spin" />
                          ) : v.isFollowing ? (
                            <FiCheck className="h-3 w-3" />
                          ) : (
                            <FiUserPlus className="h-3 w-3" />
                          )}
                          {v.isFollowing ? t('social.search.following') : t('social.search.follow')}
                        </button>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}

            {/* Still looking: the rows already found stay put and the spinner
              trails them, instead of dimming or replacing the list. */}
            {isPending && results.length > 0 && (
              <div className="flex justify-center py-4" role="status" aria-live="polite">
                <FiLoader className="h-4 w-4 animate-spin text-gray-400" aria-label={t('social.search.searching')} />
              </div>
            )}
          </>
        )}
      </section>
    </MockedSubPageLayout>
  );
}
