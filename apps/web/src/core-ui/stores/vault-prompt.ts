import { create } from 'zustand';
import { MIN_IDLE_USDC } from '../helpers/numbers';

type VaultPromptState = {
  /** The user has closed the screen, or invested, and is not to be asked again. */
  dismissed: boolean;
  /**
   * The last idle balance this page load saw. Null until the first reading:
   * money that was already there when the app opened is not money that just
   * arrived, and treating it as such re-armed the prompt on every remount.
   */
  lastIdle: number | null;
  /**
   * An investment went through and the balance has not caught up. The wallet
   * read lags the transaction, so for a few seconds the old amount comes back —
   * that is not new money, it is a balance that has not heard yet.
   */
  settling: boolean;
};

/** Where a dismissal is remembered across a document, and for how long. */
const DISMISS_KEY = 'vaquita:vault-prompt-dismissed-at';
/**
 * How long a dismissal outlives the document it happened in.
 *
 * One pull-to-refresh in the installed app can load the document twice — iOS
 * runs its own pull-to-refresh in a standalone window and ours cannot cancel it
 * once the platform owns the touch sequence — and a fresh document has no memory
 * of the screen the user just closed. Long enough to cover that second load;
 * short enough that opening the app later still offers to put the money to work.
 */
const DISMISS_COOLDOWN_MS = 60_000;

/** The fallback when storage throws (private mode, blocked site data). */
let dismissedInMemory = false;

const dismissedAt = (): number => {
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch {
    return dismissedInMemory ? Date.now() : 0;
  }
};

const rememberDismissal = (): void => {
  dismissedInMemory = true;
  try {
    window.sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // The in-memory flag still holds for this document.
  }
};

const forgetDismissal = (): void => {
  dismissedInMemory = false;
  try {
    window.sessionStorage.removeItem(DISMISS_KEY);
  } catch {
    // Same as above.
  }
};

/**
 * Whether the idle-funds screen has had its answer, kept outside React.
 *
 * All of this is once-per-load state, and the component holding it mounts inside
 * the private tree — which is remounted whole on a warm reload, because the legal
 * and onboarding gates decide from the persisted query cache and then decide
 * again when their refetch lands. Component state does not survive that, so the
 * screen the user had just closed opened straight back up, and `prevIdle`
 * restarting at zero made the next balance reading look like money that had just
 * arrived, which re-armed the prompt a second time.
 */
export const useVaultPromptStore = create<VaultPromptState>(() => ({
  dismissed: Date.now() - dismissedAt() < DISMISS_COOLDOWN_MS,
  lastIdle: null,
  settling: false,
}));

/** The user closed the screen, or invested. Either way they have answered. */
export const dismissVaultPrompt = (): void => {
  rememberDismissal();
  useVaultPromptStore.setState({ dismissed: true });
};

/** Invested: ignore the stale balance until it drops below the floor. */
export const markVaultInvestSettling = (): void => useVaultPromptStore.setState({ settling: true });

/**
 * Fold one balance reading into that memory. True when the balance has risen
 * since the last one, which is the signal that new money landed: the prompt is
 * re-armed, and the caller stops the header blinking.
 */
export const observeVaultIdle = (idle: number): boolean => {
  const { settling, lastIdle } = useVaultPromptStore.getState();

  if (settling) {
    // Only once the balance drops below the floor do we know the investment is
    // reflected; from there a rise means new money again.
    useVaultPromptStore.setState({ lastIdle: idle, settling: idle >= MIN_IDLE_USDC });
    return false;
  }

  const arrived = lastIdle !== null && idle > lastIdle + 0.01;
  useVaultPromptStore.setState(arrived ? { lastIdle: idle, dismissed: false } : { lastIdle: idle });
  if (arrived) forgetDismissal();
  return arrived;
};
