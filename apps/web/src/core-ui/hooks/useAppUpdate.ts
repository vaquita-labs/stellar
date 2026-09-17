'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { BUILD_STAMP } from '../config/buildStamp';
import { isVersionCheckEnabled } from '../config/featureFlags';
import { useIsTabVisible } from '../stores';

/** Slow on purpose: see the note about idle tabs in the docblock below. */
const POLL_INTERVAL_MS = 15 * 60 * 1000;
/** Floor between two checks, so a burst of tab switches cannot hammer the endpoint. */
const MIN_GAP_MS = 2 * 60 * 1000;
/** `fetch` has no timeout of its own, and a hung request never settles. */
const FETCH_TIMEOUT_MS = 8000;

/** The build we last reloaded for, remembered for the life of the tab. */
const RELOADED_KEY = 'vaquita:app-build-reloaded';

const reloadedFor = (): string | null => {
  try {
    return window.sessionStorage.getItem(RELOADED_KEY);
  } catch {
    return null;
  }
};

const rememberReload = (build: string): void => {
  try {
    window.sessionStorage.setItem(RELOADED_KEY, build);
  } catch {
    // Private mode, blocked site data. The reload still happens; the only thing
    // lost is the guard against prompting again for the same build.
  }
};

/** The stamp out of `/api/version`, or null for anything that is not one. */
const readBuild = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const build = (payload as { build?: unknown }).build;
  return typeof build === 'string' && build.length > 0 ? build : null;
};

/**
 * Whether the container is now serving a build newer than the one this tab is
 * running.
 *
 * It asks `/api/version` and compares the answer against the stamp inlined into
 * this bundle. A plain `fetch`, NOT react-query: the shared client has
 * `staleTime` of a day, no refetch on focus, and persists to localStorage — the
 * three things that would make this answer with the build from yesterday.
 *
 * This exists for the tab nobody touched. Next already repairs version skew on
 * navigation (it turns the next route change into a full page load when the
 * build id no longer matches), so the only user left stranded is the one who
 * left the app open and came back to it. That is also why the interval is
 * generous and why nothing here reloads on its own: the answer is a banner the
 * user presses, never a page that vanishes mid-deposit.
 *
 * Every failure is swallowed deliberately — offline, a timeout, a non-200, or
 * HTML where JSON was expected (a country-blocked rewrite). Not knowing is the
 * same as being up to date: we say nothing.
 */
export const useAppUpdate = () => {
  const [newBuild, setNewBuild] = useState<string | null>(null);
  const visible = useIsTabVisible();
  const lastCheckRef = useRef(0);

  useEffect(() => {
    // Latched: once there is a new build, there is nothing left to learn.
    if (!isVersionCheckEnabled() || newBuild) return;

    let cancelled = false;

    const check = async () => {
      if (Date.now() - lastCheckRef.current < MIN_GAP_MS) return;
      lastCheckRef.current = Date.now();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch('/api/version', { cache: 'no-store', signal: controller.signal });
        if (!res.ok) return;
        const build = readBuild(await res.json());
        if (cancelled || !build || build === BUILD_STAMP) return;
        // We already reloaded for this one and came back on the old bundle
        // anyway — the document was served from the browser's own cache.
        // Prompting again would be a reload loop, so this tab stays quiet.
        if (build === reloadedFor()) return;
        setNewBuild(build);
      } catch {
        // Nothing to do: staying quiet is the correct outcome.
      } finally {
        clearTimeout(timer);
      }
    };

    if (visible) void check();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [visible, newBuild]);

  const applyUpdate = useCallback(() => {
    if (newBuild) rememberReload(newBuild);
    window.location.reload();
  }, [newBuild]);

  return { updateAvailable: newBuild !== null, applyUpdate };
};
