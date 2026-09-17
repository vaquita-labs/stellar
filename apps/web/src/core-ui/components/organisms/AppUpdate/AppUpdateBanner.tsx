'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw, FiX } from 'react-icons/fi';
import { useAppUpdate } from '../../../hooks';

/**
 * A bar at the top of the app saying a newer build is being served.
 *
 * Deliberately NOT a modal, and deliberately outside the auto-modal queue: that
 * queue is for one-time interruptions decided once at load, whereas this can
 * become true at any moment — including while the user is in the middle of a
 * deposit. A bar above the content states the fact and leaves the screen alone.
 *
 * It never reloads on its own either. The button is the reload, the same
 * `window.location.reload()` the install prompt and pull-to-refresh already use.
 *
 * Dismissal lasts this mount: the tab is genuinely stale, so the fact does not
 * stop being true, but nobody should be nagged twice about it.
 */
export function AppUpdateBanner() {
  const { t } = useTranslation();
  const { updateAvailable, applyUpdate } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      // Not fixed: it is a flex child above the scroll region, so it pushes the
      // page down instead of covering whatever header is underneath. The safe
      // area is its own because it is the topmost thing on screen.
      className="shrink-0 flex items-center gap-2 border-b border-black bg-primary px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]"
    >
      <FiRefreshCw aria-hidden className="h-4 w-4 shrink-0 text-black" />
      <p className="min-w-0 flex-1 text-xs font-semibold leading-tight text-black">
        {t('common.newVersion.title', "There's a new version of the app")}
      </p>
      <button
        type="button"
        onClick={applyUpdate}
        className="shrink-0 rounded-full border border-black border-b-2 bg-white px-3 py-1 text-xs font-bold text-black transition active:border-b-[1px] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        {t('common.newVersion.action', 'Reload')}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t('common.newVersion.dismissAria', 'Dismiss')}
        className="shrink-0 rounded-full p-1 text-black/60 transition active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <FiX className="h-4 w-4" />
      </button>
    </div>
  );
}
