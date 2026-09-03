'use client';

import { PULL_TO_REFRESH_THRESHOLD_PX, usePullToRefresh } from '@/core-ui/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { ReactNode, useCallback } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

/**
 * Marks the subtrees the pull must never claim. Only the home map carries it:
 * it is a WebGL canvas that pans with the same downward drag, and it never
 * scrolls, so without this the gesture would fight the camera.
 */
const PULL_IGNORE_SELECTOR = '[data-pull-ignore]';

/** How far above the surface's top edge the indicator parks while idle. */
const INDICATOR_HIDDEN_PX = 44;

/**
 * Above the modal backdrop, so the indicator stays visible when the pull
 * happens inside a panel or a sheet.
 */
const INDICATOR_Z = 60;

/**
 * The app's main scroll region, plus the pull-to-refresh indicator for the
 * whole app.
 *
 * The gesture itself is bound to the document (see `usePullToRefresh`), because
 * panels and sheets are portalled outside this subtree. The indicator is fixed
 * and follows whichever surface is being pulled.
 *
 * Refreshing refetches the queries the current screen has mounted, and nothing
 * else. It deliberately does not reload the page: that would replay
 * rehydration, the gates and the 3D world to end up on the same route with the
 * same data.
 */
export function PullToRefresh({ className, children }: { className?: string; children: ReactNode }) {
  const queryClient = useQueryClient();

  // `type: 'active'` limits both the invalidation and the refetch to queries
  // that currently have a mounted observer, which is exactly what is on screen.
  // A bare invalidate would also mark the persisted cache stale — catalog, map
  // objects, badges — and write that back to localStorage.
  const onRefresh = useCallback(() => queryClient.invalidateQueries({ type: 'active' }), [queryClient]);

  const { distance, pulling, armed, refreshing, anchor } = usePullToRefresh({
    onRefresh,
    ignoreSelector: PULL_IGNORE_SELECTOR,
  });

  const visible = distance > 0 || refreshing;

  return (
    <>
      <main className={className}>{children}</main>
      <div
        className="pointer-events-none fixed flex justify-center"
        style={{
          zIndex: INDICATOR_Z,
          top: anchor?.top ?? 0,
          left: anchor?.left ?? 0,
          width: anchor?.width ?? '100%',
        }}
        aria-hidden="true"
      >
        <div
          style={{
            transform: `translateY(${distance - INDICATOR_HIDDEN_PX}px)`,
            opacity: visible ? Math.min(1, distance / PULL_TO_REFRESH_THRESHOLD_PX) : 0,
            // The indicator tracks the finger exactly while pulling, and eases
            // back on release.
            transition: pulling ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out',
          }}
        >
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-b-2 border-black bg-white shadow-sm ${
              armed || refreshing ? 'text-primary' : 'text-black'
            }`}
          >
            <FiRefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
              style={refreshing ? undefined : { transform: `rotate(${distance * 3}deg)` }}
            />
          </span>
        </div>
      </div>
    </>
  );
}
