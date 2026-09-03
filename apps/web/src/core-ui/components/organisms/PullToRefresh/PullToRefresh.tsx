'use client';

import { PULL_TO_REFRESH_THRESHOLD_PX, usePullToRefresh } from '@/core-ui/hooks';
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
 * Refreshing reloads the document, the same as the browser's own reload button.
 * It is the heavy option on purpose: it replays rehydration, the gates and the
 * 3D world, and it also picks up a new deployment, which refetching alone never
 * does. Note that the persisted query cache lives in localStorage and survives
 * a reload, so data that is still fresh by its own rules comes back from there.
 */
export function PullToRefresh({ className, children }: { className?: string; children: ReactNode }) {
  // The returned promise never settles on purpose: the reload tears the page
  // down, and until it does the indicator should keep spinning rather than snap
  // back as if the refresh had finished.
  const onRefresh = useCallback(() => {
    window.location.reload();
    return new Promise<void>(() => {});
  }, []);

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
