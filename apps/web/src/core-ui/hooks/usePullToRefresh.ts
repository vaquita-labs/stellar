'use client';

import { useEffect, useRef, useState } from 'react';

/** Finger travel, after resistance, that arms a refresh. */
const THRESHOLD_PX = 64;
/** Hard cap on how far the indicator travels, however long the pull is. */
const MAX_PULL_PX = 96;
/** Fraction of the finger movement the indicator follows, so the pull feels elastic. */
const RESISTANCE = 0.5;
/** Movement under this is noise: the gesture has no direction yet. */
const DIRECTION_SLOP_PX = 16;
/**
 * How much the downward travel must beat the sideways travel before the pull
 * claims the gesture. A drag that is merely more vertical than horizontal is not
 * enough: on a short screen an ordinary scroll starts with exactly that wobble.
 */
const DIRECTION_RATIO = 1.5;
/** Floor for the spinner, so a refresh answered from cache still reads as an action. */
const MIN_SPIN_MS = 450;

/** Where the pulled surface sits in the viewport, so the indicator can hang off its top edge. */
export type PullAnchor = { top: number; left: number; width: number };

export type PullToRefreshState = {
  /** How far the indicator is pulled down, in px. */
  distance: number;
  /** A finger is down and the pull owns the gesture. */
  pulling: boolean;
  /** The pull cleared the threshold: letting go now refreshes. */
  armed: boolean;
  /** A refresh is running. */
  refreshing: boolean;
  /** The surface of the last gesture. Null before the first one. */
  anchor: PullAnchor | null;
};

const scrollsVertically = (el: Element) => {
  const overflowY = getComputedStyle(el).overflowY;
  return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
};

/**
 * Walks outward from the touched element to decide whether the pull may claim
 * this gesture, and which surface it belongs to.
 *
 * It refuses as soon as it meets something that already owns a downward drag:
 * an element the app marked as off-limits (the map pans with the same
 * movement), or content scrolled away from its top, which has somewhere to go.
 * Otherwise the pull is allowed, anchored to the nearest scrollable ancestor —
 * a page, a panel, a sheet — or to the viewport when nothing scrolls.
 */
const resolvePullSurface = (target: EventTarget | null, ignoreSelector: string) => {
  let node = target instanceof Element ? target : null;
  let surface: Element | null = null;
  while (node) {
    if (node.matches(ignoreSelector)) return { allowed: false, surface: null };
    if (node.scrollTop > 0) return { allowed: false, surface: null };
    if (!surface && scrollsVertically(node)) surface = node;
    node = node.parentElement;
  }
  return { allowed: true, surface };
};

const anchorOf = (surface: Element | null): PullAnchor => {
  if (!surface) return { top: 0, left: 0, width: window.innerWidth };
  const rect = surface.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width };
};

const buzz = (ms: number) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
};

/**
 * Pull-to-refresh for the whole app.
 *
 * The browser's own gesture never fires here: `html` and `body` are pinned to
 * the viewport height with `overflow: hidden`, so the document never scrolls
 * and never overscrolls, and an installed (standalone) window drops the gesture
 * regardless. This reproduces the gesture and hands the refresh itself to the
 * caller, which decides what refreshing means.
 *
 * The listeners live on the document rather than on one container, because the
 * surfaces that need the gesture are not all in the same subtree: pages render
 * inside the app's scroll region, while panels and sheets are portalled to the
 * end of `body`. Each gesture resolves its own surface from the element under
 * the finger.
 *
 * `ignoreSelector` marks the subtrees the pull must never claim.
 */
export const usePullToRefresh = ({
  onRefresh,
  ignoreSelector,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  ignoreSelector: string;
}): PullToRefreshState => {
  const [distance, setDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [anchor, setAnchor] = useState<PullAnchor | null>(null);

  // Read at gesture time, so a re-rendered callback never leaves a stale one
  // attached and the listeners survive a new `onRefresh` identity.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    let tracking = false;
    let decided = false;
    let refreshingNow = false;
    let startY = 0;
    let startX = 0;
    let pulled = 0;
    let surface: Element | null = null;
    let alive = true;

    const reset = () => {
      tracking = false;
      decided = false;
      pulled = 0;
      setDistance(0);
      setPulling(false);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingNow || event.touches.length !== 1) return;
      const resolved = resolvePullSurface(event.target, ignoreSelector);
      if (!resolved.allowed) return;
      surface = resolved.surface;
      setAnchor(anchorOf(surface));
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      tracking = true;
      decided = false;
      pulled = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking) return;
      const dy = event.touches[0].clientY - startY;
      const dx = event.touches[0].clientX - startX;

      if (!decided) {
        if (Math.abs(dy) < DIRECTION_SLOP_PX && Math.abs(dx) < DIRECTION_SLOP_PX) return;
        // Up, or not decisively downward: the scroller and the carousels keep it.
        if (dy <= 0 || dy < Math.abs(dx) * DIRECTION_RATIO) {
          tracking = false;
          return;
        }
        decided = true;
        setPulling(true);
      }

      // The finger came back to its starting point. Hand the gesture back
      // instead of holding it for the rest of the touch, which is what left a
      // short screen feeling stuck: a drag that began with a downward wobble
      // stayed captured however far it then travelled up.
      if (dy <= 0) {
        reset();
        return;
      }

      // Content moved under the finger (momentum from a previous flick).
      if (surface && surface.scrollTop > 0) {
        reset();
        return;
      }

      // Claim the gesture, or the surface rubber-bands under the indicator.
      if (event.cancelable) event.preventDefault();

      const next = Math.max(0, Math.min(MAX_PULL_PX, (dy - DIRECTION_SLOP_PX) * RESISTANCE));
      if (next >= THRESHOLD_PX && pulled < THRESHOLD_PX) buzz(8);
      pulled = next;
      setDistance(next);
    };

    const onTouchEnd = async (event: TouchEvent) => {
      if (!tracking) return;
      // The pull may have started on a link or a button. Movement alone does not
      // always cancel the tap, so a pull that owned the gesture also swallows
      // the click it would otherwise synthesize.
      if (decided && event.cancelable) event.preventDefault();
      const shouldRefresh = decided && pulled >= THRESHOLD_PX;
      tracking = false;
      decided = false;
      pulled = 0;
      setPulling(false);

      if (!shouldRefresh) {
        setDistance(0);
        return;
      }

      refreshingNow = true;
      setRefreshing(true);
      // Rest the indicator at the threshold while the refetch runs.
      setDistance(THRESHOLD_PX);
      const startedAt = Date.now();
      try {
        await onRefreshRef.current();
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_SPIN_MS) await new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS - elapsed));
        refreshingNow = false;
        if (alive) {
          setRefreshing(false);
          setDistance(0);
        }
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    // Not passive: the handler calls preventDefault once the pull is its own gesture.
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    // Not passive either: a pull that ran swallows the click on release.
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      alive = false;
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', reset);
    };
  }, [ignoreSelector]);

  return { distance, pulling, armed: distance >= THRESHOLD_PX, refreshing, anchor };
};

export const PULL_TO_REFRESH_THRESHOLD_PX = THRESHOLD_PX;
