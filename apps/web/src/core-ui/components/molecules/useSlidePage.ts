'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

/** Must match the exit duration in the class below. */
export const SLIDE_PAGE_EXIT_MS = 250;

/**
 * Makes a full-page route behave like the app's side-panel modals: it slides in
 * from the right on mount, and its back button slides it back out the same way
 * instead of swapping screens in one frame.
 *
 * Same timings and easing as `PANEL_CONTAINER_ANIMATION` in AppModal, so a
 * screen you reach by pushing a route feels identical to one you reach by
 * opening a panel.
 *
 * Usage:
 *   const { className, goBack } = useSlidePage('/profile');
 *   <div className={`h-full overflow-y-auto ${className}`}>
 *     <PageHeader title={…} onBack={goBack} />
 *
 * Note this only animates the in-app back control. A browser/OS back gesture
 * unmounts the route immediately — React can't hold a page open for it — so
 * that path still cuts straight to the previous screen.
 */
const ENTER = 'animate-in slide-in-from-right-full duration-300 ease-out';
const EXIT = 'animate-out slide-out-to-right-full duration-250 ease-in fill-mode-forwards';

export function useSlidePage(backHref: string) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const goBack = useCallback(() => {
    // Guard against a double tap starting a second exit (and a second push).
    if (exiting) return;
    setExiting(true);
    setTimeout(() => router.push(backHref), SLIDE_PAGE_EXIT_MS);
  }, [backHref, exiting, router]);

  return { exiting, goBack, className: exiting ? EXIT : ENTER };
}
