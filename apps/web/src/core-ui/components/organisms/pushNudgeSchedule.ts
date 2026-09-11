/**
 * When the notification-permission ask is allowed to open.
 *
 * Push is the only way to reach someone who is not currently looking at the
 * app, so a single dismissal must not cost the channel. The ask re-arms on
 * every app launch — a cold start of the installed app, or a new browser
 * session — and a 24 h floor keeps that from turning into a modal on every
 * reload within the same day.
 *
 * Two stores, because they answer two different questions:
 *
 * | Key | Store | Question |
 * |---|---|---|
 * | `vaquita:push-nudge-asked` | `sessionStorage` | already asked in THIS launch? |
 * | `vaquita:push-nudge-next-ask` | `localStorage` | asked too recently on this device? |
 *
 * Neither key existed before, so the first deploy re-arms every device exactly
 * once — the same mechanism the previous key bump used deliberately.
 *
 * Pure and storage-agnostic on purpose: `now` is passed in and every access is
 * wrapped, so this is testable without a DOM and safe in the contexts where a
 * storage read throws rather than returning null (Safari private mode, some
 * embedded webviews). A storage failure resolves to "ask" — losing the channel
 * is worse than one extra modal.
 */

const ASKED_KEY = 'vaquita:push-nudge-asked';
const NEXT_ASK_KEY = 'vaquita:push-nudge-next-ask';

/** Shortest gap between two asks on the same device. */
export const ASK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const readStore = (store: 'sessionStorage' | 'localStorage', key: string): string | null => {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
};

const writeStore = (store: 'sessionStorage' | 'localStorage', key: string, value: string): void => {
  try {
    window[store].setItem(key, value);
  } catch {
    // Nothing to do: the ask simply repeats on the next render path that checks.
  }
};

/**
 * May the ask open right now?
 *
 * Read once when the component subscribes, never during render — the React
 * Compiler forbids reading storage or the clock while rendering, and
 * `useSyncExternalStore` needs a snapshot whose identity is stable.
 */
export const canAskNow = (now: number = Date.now()): boolean => {
  if (readStore('sessionStorage', ASKED_KEY)) return false;
  const nextAsk = Number(readStore('localStorage', NEXT_ASK_KEY));
  // A missing or unparseable value reads as 0, which is always in the past.
  return !Number.isFinite(nextAsk) || now >= nextAsk;
};

/**
 * Record that the user was asked. Called on all three exits — turned on,
 * "maybe later", dismissed — because in every one of them the browser prompt
 * has had its chance for this launch.
 */
export const markAsked = (now: number = Date.now()): void => {
  writeStore('sessionStorage', ASKED_KEY, '1');
  writeStore('localStorage', NEXT_ASK_KEY, String(now + ASK_INTERVAL_MS));
};
