'use client';

import { RefObject, useEffect, useRef, useState } from 'react';

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

export type PullToRefreshState = {
  /** How far the indicator is pulled down, in px. */
  distance: number;
  /** A finger is down and the pull owns the gesture. */
  pulling: boolean;
  /** The pull cleared the threshold: letting go now refreshes. */
  armed: boolean;
  /** A refresh is running. */
  refreshing: boolean;
};

/** The gesture started inside an element the screen marked as a valid handle. */
const insideOrigin = (target: EventTarget | null, container: HTMLElement, selector: string) => {
  let node = target instanceof Element ? target : null;
  while (node && node !== container) {
    if (node.matches(selector)) return true;
    node = node.parentElement;
  }
  return false;
};

/** An ancestor already scrolled down owns the gesture: it has content to pull back. */
const insideScrolledArea = (target: EventTarget | null, container: HTMLElement) => {
  let node = target instanceof Element ? target : null;
  while (node && node !== container) {
    if (node.scrollTop > 0) return true;
    node = node.parentElement;
  }
  return false;
};

const buzz = (ms: number) => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
};

/**
 * Pull-to-refresh for a scroll container.
 *
 * The browser's own gesture never fires in this app: `html` and `body` are
 * pinned to the viewport height with `overflow: hidden`, so the document itself
 * never scrolls and never overscrolls, and an installed (standalone) window
 * drops the gesture regardless. This reproduces it on the element that does
 * scroll, and hands the refresh back to the caller instead of reloading — a
 * reload here would replay the whole boot: rehydration, the gates and the 3D
 * world.
 *
 * The gesture is claimed only when it starts at the top of the container and
 * moves down: an upward or sideways drag stays with the scroller and the
 * carousels underneath.
 *
 * `originSelector` narrows where the pull may begin. A screen whose body owns
 * the same drag — the home map pans with it — marks a handle instead, and a
 * touch that starts anywhere else is left alone. It fails closed: if nothing on
 * screen matches the selector, there is no pull.
 */
export const usePullToRefresh = (
  containerRef: RefObject<HTMLElement | null>,
  { onRefresh, originSelector }: { onRefresh: () => Promise<unknown> | unknown; originSelector?: string },
): PullToRefreshState => {
  const [distance, setDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Read at gesture time, so a re-rendered callback never leaves a stale one
  // attached and the listeners survive a new `onRefresh` identity.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let tracking = false;
    let decided = false;
    let refreshingNow = false;
    let startY = 0;
    let startX = 0;
    let pulled = 0;
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
      if (container.scrollTop > 0) return;
      if (originSelector && !insideOrigin(event.target, container, originSelector)) return;
      if (insideScrolledArea(event.target, container)) return;
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
      if (container.scrollTop > 0) {
        reset();
        return;
      }

      // Claim the gesture, or the container rubber-bands under the indicator.
      if (event.cancelable) event.preventDefault();

      const next = Math.max(0, Math.min(MAX_PULL_PX, (dy - DIRECTION_SLOP_PX) * RESISTANCE));
      if (next >= THRESHOLD_PX && pulled < THRESHOLD_PX) buzz(8);
      pulled = next;
      setDistance(next);
    };

    const onTouchEnd = async (event: TouchEvent) => {
      if (!tracking) return;
      // The pull may have started on the avatar or the balance. Movement alone
      // does not always cancel the tap, so a pull that owned the gesture also
      // swallows the click it would otherwise synthesize.
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

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    // Not passive: the handler calls preventDefault once the pull is its own gesture.
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    // Not passive either: a pull that ran swallows the click on release.
    container.addEventListener('touchend', onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      alive = false;
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', reset);
    };
  }, [containerRef, originSelector]);

  return { distance, pulling, armed: distance >= THRESHOLD_PX, refreshing };
};

export const PULL_TO_REFRESH_THRESHOLD_PX = THRESHOLD_PX;
