'use client';

import { PULL_TO_REFRESH_THRESHOLD_PX, usePullToRefresh } from '@/core-ui/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useRef } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

/**
 * Routes where a downward drag already means something else. The home map is a
 * WebGL canvas that pans with the same finger movement and never scrolls, so a
 * pull there would fight the camera.
 */
const NO_PULL_ROUTES = ['/home'];

/** How far above the top edge the indicator parks while idle. */
const INDICATOR_HIDDEN_PX = 44;

/**
 * The app's main scroll region, with pull-to-refresh on it.
 *
 * Refreshing refetches the queries the current screen has mounted, and nothing
 * else. It deliberately does not reload the page: that would replay
 * rehydration, the gates and the 3D world to end up on the same route with the
 * same data.
 */
export function PullToRefresh({ className, children }: { className?: string; children: ReactNode }) {
  const containerRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const enabled = !NO_PULL_ROUTES.some((route) => pathname?.startsWith(route));

  // `type: 'active'` limits both the invalidation and the refetch to queries
  // that currently have a mounted observer, which is exactly the screen under
  // the finger. A bare invalidate would also mark the persisted cache stale —
  // catalog, map objects, badges — and write that back to localStorage.
  const onRefresh = useCallback(() => queryClient.invalidateQueries({ type: 'active' }), [queryClient]);

  const { distance, pulling, armed, refreshing } = usePullToRefresh(containerRef, { onRefresh, enabled });

  const visible = distance > 0 || refreshing;

  return (
    <main ref={containerRef} className={className}>
      {/* Sticky row of zero height: the indicator hangs from the top of the
          scroller without taking space or pushing the content down. */}
      <div className="sticky top-0 z-30 flex h-0 justify-center" aria-hidden="true">
        <div
          className="mt-0 flex items-center justify-center"
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
      {children}
    </main>
  );
}
