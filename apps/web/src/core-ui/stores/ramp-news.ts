import { create } from 'zustand';

/** A bank purchase or withdrawal that finished while the user was away. */
export interface RampSettledItem {
  kind: 'onramp' | 'offramp';
  id: string;
  amountFiat: number;
  currency: string;
  /** Credited USDC of a purchase, when the ledger said it in time. */
  usdc: number | null;
}

/** The deposit the "still in process" notice is about. */
export interface RampPendingNotice {
  amountFiat: number;
  currency: string;
}

type RampNewsState = {
  /** The wallet these facts are about. Another wallet starts over. */
  wallet: string | null;
  /** A check has finished, well or badly. What releases the modal queue. */
  checked: boolean;
  /** A check finished without throwing, so its answer can be trusted. */
  succeeded: boolean;
  /** Rows that settled and the user has not acknowledged yet. */
  items: RampSettledItem[];
  /** Rows the provider still calls open, which is what keeps the poll alive. */
  openRows: { createdAt: string }[];
  /** The "still in process" notice, until the user dismisses it. */
  pending: RampPendingNotice | null;
  /** That notice has been on screen, so the news counts as delivered. */
  pendingShown: boolean;
};

const empty = (wallet: string | null): RampNewsState => ({
  wallet,
  checked: false,
  succeeded: false,
  items: [],
  openRows: [],
  pending: null,
  pendingShown: false,
});

/**
 * What the app has learned about the user's bank purchases and withdrawals on
 * this page load, kept outside React.
 *
 * `RampSettledGate` mounts inside the private tree, and that tree is remounted
 * whole on a warm reload: the legal and onboarding gates paint from the
 * localStorage-persisted query cache, then re-decide when the refetch lands,
 * and each swaps `children` for a screen of its own while it does. Component
 * state does not survive that, and everything here is a once-per-load fact, so
 * losing it shows the user the same notice twice — or, worse, silently loses
 * the "your deposit arrived" one, because the first check already closed the
 * row on the server and the second finds nothing left to announce.
 *
 * Deliberately not persisted: a real page load starts over, which is what makes
 * the notice reappear when the user comes back to look. The one exception is
 * the notice's own cooldown below, which has to outlive the document.
 */
export const useRampNewsStore = create<RampNewsState>(() => empty(null));

/**
 * Whether a check is in flight. A module value rather than store state: a check
 * is never cancelled — it closes rows on the server, so dropping its answer
 * would lose the modal for good — and nothing renders from it.
 */
let checking = false;

export const isRampCheckRunning = (): boolean => checking;

export const setRampCheckRunning = (running: boolean): void => {
  checking = running;
};

/**
 * Claim the opening check for this wallet. False when it has already answered,
 * or is answering: that is how a remount picks up where the last mount left off
 * instead of asking the provider all over again. A check that threw is not an
 * answer, so the next mount is allowed to try again.
 */
export const claimRampCheck = (wallet: string): boolean => {
  const state = useRampNewsStore.getState();
  if (state.wallet === wallet) return !state.succeeded && !checking;
  useRampNewsStore.setState(empty(wallet), true);
  return true;
};

export const finishRampCheck = (succeeded: boolean): void =>
  useRampNewsStore.setState((state) => ({ checked: true, succeeded: state.succeeded || succeeded }));

/**
 * Added, not replaced: a row that settles on a later check is news of its own.
 *
 * Money arriving retires the "still in process" notice, whichever row settled.
 * The two modals are the same dialog in the same place, so leaving the notice
 * behind means dismissing "your deposit is complete" uncovers "your deposit is
 * still being processed" in the very same frame — which is the double the user
 * sees. A row still open goes on being polled and gets its own modal when it
 * lands, so nothing is lost by dropping the notice here.
 */
export const addRampSettledItems = (items: RampSettledItem[]): void =>
  useRampNewsStore.setState((state) => ({
    items: [...state.items, ...items.filter((item) => !state.items.some((seen) => seen.id === item.id))],
    pending: null,
    pendingShown: false,
  }));

export const setRampOpenRows = (openRows: { createdAt: string }[]): void => useRampNewsStore.setState({ openRows });

export const clearRampSettledItems = (): void => useRampNewsStore.setState({ items: [] });

/** The notice has been delivered — see {@link clearRampPending}. */
export const markRampPendingShown = (): void =>
  useRampNewsStore.setState((state) => (state.pendingShown ? state : { pendingShown: true }));

/**
 * Drop the notice. Called when the user dismisses it and, once it has been on
 * screen, whenever it leaves the screen for any other reason.
 *
 * The notice is one piece of news, and news is delivered once. Everything that
 * decides whether it renders is derived and can flip back — another auto-modal
 * taking the queue turn, the deposit sheet opening, a gate swapping the private
 * tree out — and the modal is mounted rather than opened, so coming back replays
 * the entering animation and reads as a second pop-up. Retiring the notice the
 * moment it stops being visible is what makes "shown once" true, rather than
 * hoping nothing ever hides it.
 */
export const clearRampPending = (): void => useRampNewsStore.setState({ pending: null, pendingShown: false });

/** Where the last "still in process" notice is remembered, and for how long. */
const NOTICE_KEY = 'vaquita:ramp-pending-notice-at';
/**
 * How long a given notice silences the next one.
 *
 * A module flag is not enough. One pull-to-refresh in the installed app can
 * load the document TWICE — iOS runs its own pull-to-refresh in a standalone
 * window, and once it has claimed the touch sequence our `touchmove` handler
 * stops being cancelable, so both its reload and ours go through. Each load is
 * a fresh module, so anything held in memory says "not shown yet" and the user
 * gets the notice a second time, seconds after dismissing the first.
 *
 * Long enough to cover that second load and the user's dismissal of the first;
 * short enough that coming back later to check on the deposit still says
 * something rather than nothing.
 */
const NOTICE_COOLDOWN_MS = 60_000;

/**
 * Storage can throw (private mode, blocked site data) and a notice is not worth
 * an exception, so the in-memory flag is the fallback — it still covers the
 * remount case, which is the common one.
 */
let noticeGivenInMemory = false;

const noticeGivenAt = (): number => {
  try {
    const raw = window.sessionStorage.getItem(NOTICE_KEY);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch {
    return noticeGivenInMemory ? Date.now() : 0;
  }
};

const rememberNoticeGiven = (): void => {
  noticeGivenInMemory = true;
  try {
    window.sessionStorage.setItem(NOTICE_KEY, String(Date.now()));
  } catch {
    // The in-memory flag above still holds for this document.
  }
};

/**
 * Raise the "still in process" notice, unless it has already been given.
 *
 * Not per row: the news is that a deposit of the user's has not been credited
 * yet, which is one piece of news however many rows are open. Keyed by row it
 * came back for whoever had two of them, the check naming whichever the server
 * returned first.
 */
export const raiseRampPending = (notice: RampPendingNotice): void => {
  if (Date.now() - noticeGivenAt() < NOTICE_COOLDOWN_MS) return;
  rememberNoticeGiven();
  useRampNewsStore.setState({ pending: notice });
};
