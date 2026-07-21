'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AvatarConfig } from '@vaquita/avatar';
import { Avatar } from './LeaderboardCard';

/* ------------------------------------------------------------------ */
/* Own-row tracking — drives the pinned "you are #N" bar               */
/* ------------------------------------------------------------------ */

/** Visible height (px) of the own row that counts as "you reached your row",
 *  i.e. enough to hide the pinned bar. */
const OWN_ROW_HIDE_PX = 40;
/** Fires the observer often enough that the px-based hysteresis stays accurate
 *  even for tall rows, where 40px is a small ratio. */
const OWN_ROW_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/**
 * Watches the viewer's own row in the board. While the row is off-screen the
 * pinned bar shows, anchored to the edge the row left by (above → drops from
 * the top, below → rises from the bottom); once the row scrolls into view the
 * bar hides back through that same edge — your row "integrates" into the list.
 *
 * The transition is hysteretic on purpose: the bar only *appears* once the row
 * is fully off-screen, and only *disappears* once a real chunk of it is on
 * screen. With a single threshold the two states fought each other around the
 * boundary and the bar flickered while scrolling.
 */
export function useOwnRowTracking() {
  // Defaults: row not on screen, and further down the board.
  const [ownRowVisible, setOwnRowVisible] = useState(false);
  const [side, setSide] = useState<'above' | 'below'>('below');
  // The bar animates in/out, so it must not slide out on first paint just
  // because the default hadn't been corrected by the observer yet.
  const [resolved, setResolved] = useState(false);
  const nodeRef = useRef<HTMLLIElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Callback ref: fires on mount/unmount of the own row, including when the
  // board swaps which rendered row (if any) is the viewer's.
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

        // Only re-anchor while the row is fully out of view. Re-deriving the
        // side on every callback would move the anchor mid-retraction, and the
        // bar would fly across the screen instead of tucking back into its edge.
        if (visiblePx === 0) {
          const rootTop = entry.rootBounds?.top ?? 0;
          setSide(entry.boundingClientRect.top < rootTop ? 'above' : 'below');
        }

        setOwnRowVisible((prev) => {
          // Enough of the row on screen → your row took over, hide the bar.
          if (visiblePx >= OWN_ROW_HIDE_PX) return true;
          // Row completely out of the viewport → show the bar.
          if (visiblePx === 0) return false;
          // Only a sliver on screen: dead zone. Keep whatever we were showing
          // so the bar can't toggle on every pixel of scroll.
          return prev;
        });
      },
      { threshold: OWN_ROW_THRESHOLDS },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const scrollToOwnRow = useCallback((behavior: ScrollBehavior = 'smooth') => {
    nodeRef.current?.scrollIntoView({ behavior, block: 'center' });
  }, []);

  /** True once the own row exists in the DOM — i.e. scrolling to it will work. */
  const hasOwnRowNode = useCallback(() => !!nodeRef.current, []);

  return { ownRowVisible, side, resolved, ownRowRef, scrollToOwnRow, hasOwnRowNode };
}

/* ------------------------------------------------------------------ */
/* Pinned bar                                                          */
/* ------------------------------------------------------------------ */

export interface PinnedRowData {
  position: number;
  username: string;
  avatarConfig?: AvatarConfig;
  walletAddress?: string;
  /** Weekly XP, shown so the bar carries the same number as the board rows. */
  xp: number;
}

/** Slim pinned bar with the viewer's live rank. Tapping it scrolls the board to
 *  the real row. Always mounted while the page has an own row: it slides out of
 *  the edge your row left by and tucks back into that same edge, so showing and
 *  hiding are the same motion in reverse. */
export function PinnedOwnRow({
  row,
  side,
  shown,
  onPress,
}: {
  row: PinnedRowData;
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
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSwapping(false)));
    return () => cancelAnimationFrame(id);
  }, [side]);

  const visible = shown && entered;
  return (
    // Fixed, NOT sticky: as a sticky flex child of the board column, mounting
    // the bar reflowed the list and could push the own row back into view —
    // which unmounted the bar, which pushed the list back... an infinite
    // show/hide loop. Out of flow, showing it can't move the row it's tracking.
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
          className={`w-full flex items-center gap-2 border-2 border-black bg-primary px-3 py-2 shadow-lg ${
            anchoredTop ? 'rounded-b-2xl' : 'rounded-t-2xl'
          }`}
        >
          <span className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums text-black">
            {row.position}
          </span>
          <Avatar username={row.username} avatarConfig={row.avatarConfig} seed={row.walletAddress} />
          <span className="flex-1 min-w-0 text-left text-sm font-extrabold text-black truncate">
            {row.username}
          </span>
          {/* Deliberately tiny: it's a label, not a stat — at the row's own
              size it competed with the username and the XP. */}
          <span className="shrink-0 rounded-sm bg-black px-1.5 py-0.5 text-[7px] font-bold uppercase leading-tight tracking-wider text-white">
            {t('leaderboard.card.you', 'You')}
          </span>
          <span className="shrink-0 inline-flex items-center gap-1 text-sm font-extrabold tabular-nums text-black">
            {/* Same star as the board rows, so the pinned bar reads as one of
                them rather than a different widget. */}
            <Image
              src="/icons/global/star.png"
              alt=""
              width={16}
              height={16}
              className="object-contain"
            />
            {t('leaderboard.league.xpValue', '{{xp}} XP', { xp: row.xp.toLocaleString() })}
          </span>
        </button>
      </div>
    </div>
  );
}
