'use client';

import { useEffect, useState } from 'react';

/** How often to look. Same cadence as the home tour's own check. */
const POLL_MS = 200;

/**
 * Is there a modal on screen right now?
 *
 * Asked of the DOM rather than of a registry on purpose. Every sheet in the app
 * goes through heroui, which stamps `role="dialog"` on the dialog it renders,
 * so one written a year from now is covered without anyone remembering to sign
 * it up. `HomeTour` asks the same question the same way before drawing its
 * coach marks.
 *
 * `enabled` keeps the poll off unless a caller is actually waiting for the
 * screen to clear.
 */
export const useModalOnScreen = (enabled: boolean) => {
  // Starts `true`, and goes back to `true` whenever the poll stops: a caller
  // must never act on "nothing on screen" before anyone has looked. The wrong
  // answer here puts a full-screen prompt on top of what the user is doing.
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    const look = () => setOnScreen(document.querySelector('[role="dialog"]') !== null);
    const id = window.setInterval(look, POLL_MS);

    return () => {
      window.clearInterval(id);
      setOnScreen(true);
    };
  }, [enabled]);

  return onScreen;
};
