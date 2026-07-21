'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeaderboardResponseDTO } from '@/core-ui/types';
import { LEADERBOARD_PAGE_SIZE, useLeaderboardData, useProfileData } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { PageLayout } from '../../molecules';
import {
  Avatar,
  LeaderboardCard,
  LeaderboardCardData,
  LeaderboardCardSkeleton,
  PositionPill,
  getLeaderboardUsername,
} from './LeaderboardCard';
import { LeaderboardSubHeader, SortDirection, SortKey } from './LeaderboardSubHeader';

const SKELETON_ROWS = 3;
const SEARCH_DEBOUNCE_MS = 350;

/* ------------------------------------------------------------------ */
/* Debounced value                                                     */
/* ------------------------------------------------------------------ */

/** Debounce the search text before it becomes a server query param, so we
 *  don't fire one request per keystroke. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function LoadingState() {
  const { t } = useTranslation();
  return (
    <ul
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label={t('leaderboard.loadingLabel', 'Loading leaderboard')}
    >
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i}>
          <LeaderboardCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-black/10 bg-white p-8 text-center">
      <Image src="/vaquita/error.svg" alt="" width={140} height={140} />
      <p className="text-base font-extrabold text-black">
        {t('leaderboard.empty.title', 'No vaqueros on the board yet')}
      </p>
      <p className="text-xs text-gray-500 max-w-xs">
        {t(
          'leaderboard.empty.description',
          "Be the first to climb the ranks — start a deposit streak and you'll show up here."
        )}
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 text-center">
      <p className="text-sm font-extrabold text-black">
        {t('leaderboard.noResults.title', 'No vaqueros match “{{query}}”', { query })}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {t('leaderboard.noResults.description', 'Try a different username or clear the search.')}
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-3xl border border-red-300 bg-red-50 p-6 text-center">
      <p className="text-sm font-extrabold text-red-700">
        {t('leaderboard.error.title', "Couldn't load the leaderboard")}
      </p>
      <p className="mt-1 text-xs text-red-700/80 break-words">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Infinite-scroll sentinel                                            */
/* ------------------------------------------------------------------ */

/** Invisible marker below the feed — when it scrolls into view (with a
 *  viewport of margin to prefetch early), ask for the next page. */
function LoadMoreSentinel({
  onVisible,
  disabled,
}: {
  onVisible: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (disabled) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisibleRef.current();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled]);

  return <div ref={ref} aria-hidden className="h-px" />;
}

/* ------------------------------------------------------------------ */
/* Own-row tracking — drives the pinned "you are #N" bar               */
/* ------------------------------------------------------------------ */

/** Visible height (px) of the own card that counts as "you reached your row",
 *  i.e. enough to hide the pinned bar. */
const OWN_ROW_HIDE_PX = 56;
/** Fires the observer often enough that the px-based hysteresis stays accurate
 *  even for very tall cards, where 56px is a tiny ratio. */
const OWN_ROW_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * Watches the viewer's own card in the feed. While the card is off-screen the
 * pinned bar shows, anchored to the edge the card left by (above → drops from
 * the top, below → rises from the bottom); once the card scrolls into view the
 * bar hides back through that same edge — your row "integrates" into the list.
 *
 * The transition is hysteretic on purpose: the bar only *appears* once the card
 * is fully off-screen, and only *disappears* once a real chunk of it is on
 * screen. With a single threshold the two states fought each other around the
 * boundary and the bar flickered while scrolling.
 */
function useOwnRowTracking() {
  // Defaults: card not on screen, and further down the feed (deep ranks aren't
  // even loaded yet).
  const [ownRowVisible, setOwnRowVisible] = useState(false);
  const [side, setSide] = useState<'above' | 'below'>('below');
  // The bar animates in/out, so it must not slide out on first paint just
  // because the default hadn't been corrected by the observer yet.
  const [resolved, setResolved] = useState(false);
  const nodeRef = useRef<HTMLLIElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Callback ref: fires on mount/unmount of the own card, including when a
  // search/sort view swaps which rendered row (if any) is the viewer's.
  const ownRowRef = useCallback((node: HTMLLIElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    nodeRef.current = node;
    if (!node) {
      setOwnRowVisible(false);
      setSide('below');
      setResolved(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setResolved(true);
        const visiblePx = entry.isIntersecting ? entry.intersectionRect.height : 0;

        // Only re-anchor while the card is fully out of view. Re-deriving the
        // side on every callback would move the anchor mid-retraction, and the
        // bar would fly across the screen instead of tucking back into its edge.
        if (visiblePx === 0) {
          const rootTop = entry.rootBounds?.top ?? 0;
          setSide(entry.boundingClientRect.top < rootTop ? 'above' : 'below');
        }

        setOwnRowVisible((prev) => {
          // Enough of the card on screen → your row took over, hide the bar.
          if (visiblePx >= OWN_ROW_HIDE_PX) return true;
          // Card completely out of the viewport → show the bar.
          if (visiblePx === 0) return false;
          // Only a sliver on screen: dead zone. Keep whatever we were showing
          // so the bar can't toggle on every pixel of scroll.
          return prev;
        });
      },
      { threshold: OWN_ROW_THRESHOLDS }
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const scrollToOwnRow = useCallback((behavior: ScrollBehavior = 'smooth') => {
    nodeRef.current?.scrollIntoView({ behavior, block: 'center' });
  }, []);

  /** True once the own card exists in the DOM — i.e. scrolling to it will work. */
  const hasOwnRowNode = useCallback(() => !!nodeRef.current, []);

  return { ownRowVisible, side, resolved, ownRowRef, scrollToOwnRow, hasOwnRowNode };
}

/** Slim pinned bar with the viewer's live rank. Tapping it scrolls the feed to
 *  the real card when that card is already loaded; otherwise it's a no-op.
 *  Always mounted while the page has a `me` row: it slides out of the edge your
 *  card left by and tucks back into that same edge, so showing and hiding are
 *  the same motion in reverse. */
function PinnedOwnRow({
  row,
  side,
  shown,
  onPress,
}: {
  row: { position: number; username: string; avatarUrl?: string };
  side: 'above' | 'below';
  shown: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const anchoredTop = side === 'above';
  // Mount off-screen and slide in on the next frame — mounting straight into
  // the shown position would paint it in place with no transition to run.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Swapping edges also flips the sign of the hidden transform, so animating
  // through it would send the bar flying across the viewport. The swap only
  // ever happens while hidden, so just cut the transition for that one frame.
  const [swapping, setSwapping] = useState(false);
  const prevSide = useRef(side);
  useEffect(() => {
    if (prevSide.current === side) return;
    prevSide.current = side;
    setSwapping(true);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setSwapping(false))
    );
    return () => cancelAnimationFrame(id);
  }, [side]);

  const visible = shown && entered;
  return (
    // Fixed, NOT sticky: as a sticky flex child of the feed column, mounting the
    // bar reflowed the list and could push the own card back into view — which
    // unmounted the bar, which pushed the list back... an infinite show/hide
    // loop. Out of flow, showing it can't move the card it's tracking.
    //
    // Full-bleed and flush with the viewport edge it hangs from (there is no
    // bottom navbar any more — see AppShell). `md:left-64` keeps it clear of
    // the desktop sidebar, matching `main`'s own md:ml-64. The hidden state
    // parks it just past its edge; the extra 1rem covers the shadow.
    <div
      className={`fixed left-0 right-0 md:left-64 z-30 pointer-events-none ease-out motion-reduce:transition-none ${
        swapping ? 'transition-none' : 'transition-transform duration-300'
      } ${anchoredTop ? 'top-0' : 'bottom-0'} ${
        visible
          ? 'translate-y-0'
          : anchoredTop
            ? '-translate-y-[calc(100%+1rem)]'
            : 'translate-y-[calc(100%+1rem)]'
      }`}
      aria-hidden={!visible}
    >
      <div className={visible ? 'pointer-events-auto' : ''}>
        <button
          type="button"
          onClick={onPress}
          tabIndex={visible ? 0 : -1}
          aria-label={t('leaderboard.pinned.goToPosition', 'Go to your position')}
          // A single, even border: the cards' heavier bottom edge (border-b-4)
          // read as two stacked lines once the bar floated over the feed.
          // Only the corners facing the feed are rounded — the edge flush with
          // the chrome stays square, so the bar reads as attached to it.
          className={`w-full flex items-center gap-2 border-2 border-black bg-primary px-3 py-2 shadow-lg ${
            anchoredTop ? 'rounded-b-2xl' : 'rounded-t-2xl'
          }`}
        >
          <Avatar username={row.username} avatarUrl={row.avatarUrl} />
          <span className="flex-1 min-w-0 text-left text-sm font-extrabold text-black truncate">
            {row.username}
          </span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-black text-white rounded-sm px-1.5 py-0.5">
            {t('leaderboard.card.you', 'You')}
          </span>
          <PositionPill position={row.position} medalOnly />
        </button>
      </div>
    </div>
  );
}

/** Shown while the feed is anchored to a deep page instead of the top of the
 *  board, so the list not starting at #1 never looks like a bug. */
function AnchoredNotice({ onBackToTop }: { onBackToTop: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-3 py-2">
      <span className="text-xs font-bold text-gray-500">
        {t('leaderboard.anchored.title', 'Showing your part of the board')}
      </span>
      <button
        type="button"
        onClick={onBackToTop}
        className="shrink-0 text-xs font-extrabold text-black underline underline-offset-2"
      >
        {t('leaderboard.anchored.backToTop', 'Back to #1')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

function LeaderboardFeed({
  rows,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  ownRowRef,
}: {
  rows: LeaderboardCardData[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  ownRowRef?: (node: HTMLLIElement | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.walletAddress} ref={row.isCurrentUser ? ownRowRef : undefined}>
            <LeaderboardCard user={row} />
          </li>
        ))}
        {isFetchingNextPage && (
          <li aria-label={t('leaderboard.loadingMore', 'Loading more vaqueros')}>
            <LeaderboardCardSkeleton />
          </li>
        )}
      </ul>
      <LoadMoreSentinel
        onVisible={onLoadMore}
        disabled={!hasNextPage || isFetchingNextPage}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Row builder                                                         */
/* ------------------------------------------------------------------ */

function useLeaderboardRows(rows: LeaderboardResponseDTO[]): LeaderboardCardData[] {
  const { walletAddress: currentUserWallet } = useConfigStore();

  return useMemo(() => {
    return rows.map((row) => {
      const isCurrentUser =
        !!currentUserWallet &&
        currentUserWallet.toLowerCase() === row.walletAddress.toLowerCase();

      // Lightweight "level" derivation from the real XP the API now ships per
      // profile: every 100 XP = +1 level, minimum level 1. Coerce the gamification
      // fields here so a stale react-query cache from before these fields existed
      // (global staleTime is Infinity) can't render the literal text "undefined"
      // in a card before the background refetch lands.
      const level = Math.max(1, Math.floor((row.experience ?? 0) / 100) + 1);

      return {
        position: row.position,
        walletAddress: row.walletAddress,
        nickname: (row.nickname ?? '').trim(),
        username: getLeaderboardUsername(row.nickname, row.walletAddress),
        avatarUrl: row.avatarUrl,
        level,
        streak: row.streak ?? 0,
        badges: row.badges ?? 0,
        // TODO: Replace with real likes and comments once the API ships them.
        likesSeed: 0,
        commentsSeed: 0,
        isCurrentUser,
      };
    });
  }, [rows, currentUserWallet]);
}

/* ------------------------------------------------------------------ */
/* Current-user identity (for the share modal)                         */
/* ------------------------------------------------------------------ */

function useCurrentUserIdentity() {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { data: profileData } = useProfileData();

  const displayName = useMemo(() => {
    const nickname = profileData?.nickname?.trim();
    if (nickname) return nickname;
    const full = profileData?.fullName?.trim();
    if (full) return full;
    if (walletAddress)
      return t('leaderboard.vaqueroNamed', 'Vaquero {{tail}}', {
        tail: walletAddress.slice(-4).toUpperCase(),
      });
    return t('leaderboard.vaquero', 'Vaquero');
  }, [profileData?.nickname, profileData?.fullName, walletAddress, t]);

  const handle = useMemo(
    () => getLeaderboardUsername(profileData?.nickname, walletAddress ?? ''),
    [profileData?.nickname, walletAddress]
  );

  return { displayName, handle };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const LeaderboardPage = () => {
  const { t } = useTranslation();

  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  // Row the feed starts at. 0 is the top of the board; tapping the pinned bar
  // when your card is too deep to be loaded re-anchors the feed to your page.
  const [anchorOffset, setAnchorOffset] = useState(0);
  // A ref, not state: the effect that consumes it also clears it, and clearing
  // a state dep would re-run the effect and cancel its own pending scroll.
  const pendingOwnRowScroll = useRef(false);

  // Changing the view invalidates the anchor: your row sits somewhere else in
  // it, and the offset was computed against the old ordering.
  useEffect(() => {
    setAnchorOffset(0);
    pendingOwnRowScroll.current = false;
  }, [debouncedQuery, sortKey, direction]);

  // Search + sort + pagination all happen server-side now: each view is its
  // own infinite query, and pages arrive already filtered/ordered globally.
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    fetchNextPage,
  } = useLeaderboardData({
    search: debouncedQuery,
    sort: sortKey,
    direction,
    anchorOffset,
  });

  const leaderboardRows = useMemo(
    () => data?.pages.flatMap((page) => page.rows) ?? [],
    [data]
  );
  const rankedRows = useLeaderboardRows(leaderboardRows);

  const { displayName, handle } = useCurrentUserIdentity();

  // Pinned own-position bar: the API ships the viewer's row (`me`) with every
  // page; it hangs from the edge your card is off past until it scrolls in.
  const {
    ownRowVisible,
    side: ownRowSide,
    resolved: ownRowResolved,
    ownRowRef,
    scrollToOwnRow,
    hasOwnRowNode,
  } = useOwnRowTracking();
  const myRow = data?.pages?.[0]?.me ?? null;
  const myViewIndex = data?.pages?.[0]?.meViewIndex ?? null;
  const pinnedRow = useMemo(() => {
    if (!myRow) return null;
    return {
      position: myRow.position,
      username: getLeaderboardUsername(myRow.nickname, myRow.walletAddress),
      avatarUrl: myRow.avatarUrl,
    };
  }, [myRow]);
  // Only pin over a browsable feed — searching shows a filtered view where a
  // floating global rank would just get in the way of the results.
  const canPin =
    !!pinnedRow && !debouncedQuery && !isLoading && !error && rankedRows.length > 0;
  // When the viewer's card isn't among the loaded pages there's no element to
  // observe, so nothing will ever "resolve" — off-screen is already the right
  // answer.
  const ownRowRendered = rankedRows.some((row) => row.isCurrentUser);
  const showPinned = canPin && (!ownRowRendered || ownRowResolved) && !ownRowVisible;

  // Tapping the bar: scroll if your card is already in the feed, otherwise jump
  // the feed to the page it lives on. Paging down to it isn't an option — at
  // rank 1M that's 50.000 requests, while a deep offset is a single one (the
  // API slices an already-materialised board).
  const handlePinnedPress = useCallback(() => {
    if (hasOwnRowNode()) {
      scrollToOwnRow();
      return;
    }
    if (myViewIndex == null) return;
    const target = Math.floor(myViewIndex / LEADERBOARD_PAGE_SIZE) * LEADERBOARD_PAGE_SIZE;
    pendingOwnRowScroll.current = true;
    // Already anchored there (the row just isn't rendered yet) → wait for it.
    if (target !== anchorOffset) setAnchorOffset(target);
  }, [hasOwnRowNode, scrollToOwnRow, myViewIndex, anchorOffset]);

  // The jump lands the feed on your page but not necessarily on your row, so
  // finish the trip once it mounts. Instantly, not smoothly: your card can be
  // 20 cards down a freshly rendered list and a smooth scroll would crawl.
  useEffect(() => {
    if (!pendingOwnRowScroll.current || !ownRowRendered) return;
    pendingOwnRowScroll.current = false;
    requestAnimationFrame(() => scrollToOwnRow('auto'));
  }, [ownRowRendered, scrollToOwnRow]);

  const isAnchored = anchorOffset > 0;
  const backToTop = useCallback(() => {
    pendingOwnRowScroll.current = false;
    setAnchorOffset(0);
  }, []);

  const renderFeed = () => {
    if (isLoading) return <LoadingState />;
    if (error) return <ErrorState message={`${error}`} />;
    if (rankedRows.length === 0) {
      return debouncedQuery ? <NoResults query={debouncedQuery} /> : <EmptyState />;
    }
    return (
      // While a new view (search/sort change) resolves, the previous list stays
      // visible but dimmed; the sentinel is disabled so we don't page the
      // placeholder view by accident.
      <div className={isPlaceholderData ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        <LeaderboardFeed
          rows={rankedRows}
          hasNextPage={!!hasNextPage && !isPlaceholderData}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          ownRowRef={ownRowRef}
        />
      </div>
    );
  };

  return (
    <PageLayout
      title={t('leaderboard.title', 'Leaderboard')}
      backHref="/home"
      contentClassName="!gap-3"
    >
      <LeaderboardSubHeader
        query={query}
        onQueryChange={setQuery}
        sortKey={sortKey}
        onSortChange={setSortKey}
        direction={direction}
        onDirectionChange={setDirection}
      />
      {isAnchored && <AnchoredNotice onBackToTop={backToTop} />}
      {renderFeed()}
      {/* Kept mounted while the page can pin, so showing/hiding is a slide
          rather than a remount. */}
      {canPin && pinnedRow && (
        <PinnedOwnRow
          row={pinnedRow}
          side={ownRowSide}
          shown={showPinned}
          onPress={handlePinnedPress}
        />
      )}
    </PageLayout>
  );
};
