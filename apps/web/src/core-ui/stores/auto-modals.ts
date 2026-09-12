import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

/**
 * The modals that open on their own when the app starts, in the order they get
 * the screen. This array is the whole ordering: no component names another, so
 * adding one is a line here plus a call to {@link useAutoModalSlot}.
 *
 * The order runs from most to least consequence, with one exception at the
 * head. The notification permission goes first even though it is not the
 * biggest decision, because it is the only ask that EXPIRES: the OS offers it
 * once, so covering it does not postpone it, it loses it. Everything else is
 * still there on the next load.
 *
 * Stacked, these cover each other — the first few are full-screen — and an
 * announcement may not sit on top of a decision or a prize.
 */
export const AUTO_MODAL_ORDER = [
  /** `PushNudge` — the permission ask, which expires if it is covered. */
  'push-nudge',
  /** `HomeTour` — coach marks over the whole screen. */
  'home-tour',
  /** `ClaimGate` → `ClaimRewardModal` — the last step of onboarding. */
  'welcome-claim',
  /** `AutoInvest` → `IdleFundsModal` — a decision about the user's money. */
  'vault-prompt',
  /** `BadgeClaimGate` → `AchievementModal` — a prize waiting to be claimed. */
  'badge-claim',
  /** `ReleaseNotesGate` — an announcement, so it goes last. */
  'release-notes',
] as const;

export type AutoModalId = (typeof AUTO_MODAL_ORDER)[number];

type AutoModalState = {
  /** Per modal: has it decided whether it shows, and finished if it did? */
  settled: Record<AutoModalId, boolean>;
  setSettled: (id: AutoModalId, settled: boolean) => void;
  /**
   * How many mounted components speak for each slot. A reservation may only
   * hold a slot nobody owns — see {@link useReserveAutoModalSlot}. Counted
   * rather than flagged because React's development double-mount runs the
   * claim twice before the release.
   */
  owners: Record<AutoModalId, number>;
  addOwner: (id: AutoModalId) => void;
  removeOwner: (id: AutoModalId) => void;
};

/**
 * Everything starts settled — "nothing to wait for" — on purpose. Most of these
 * only mount on the home, so on the profile or the settings screens nobody is
 * there to release them, and a `false` default would park whatever queues
 * behind them forever.
 */
const nothingPending = () => Object.fromEntries(AUTO_MODAL_ORDER.map((id) => [id, true])) as Record<AutoModalId, boolean>;

const noOwners = () => Object.fromEntries(AUTO_MODAL_ORDER.map((id) => [id, 0])) as Record<AutoModalId, number>;

const useAutoModalStore = create<AutoModalState>((set) => ({
  settled: nothingPending(),
  owners: noOwners(),
  addOwner: (id) => set((state) => ({ owners: { ...state.owners, [id]: state.owners[id] + 1 } })),
  removeOwner: (id) => set((state) => ({ owners: { ...state.owners, [id]: Math.max(0, state.owners[id] - 1) } })),
  // Writing the value it already holds returns the same state object, so the
  // effects below can fire on every render without waking every subscriber.
  setSettled: (id, settled) =>
    set((state) => (state.settled[id] === settled ? state : { settled: { ...state.settled, [id]: settled } })),
}));

/** Is every modal ahead of `id` out of the way? */
const turnIsClear = (settled: Record<AutoModalId, boolean>, id: AutoModalId) => {
  for (const other of AUTO_MODAL_ORDER) {
    if (other === id) return true;
    if (!settled[other]) return false;
  }
  return true;
};

/** Speak for a slot while mounted, so a reservation cannot overwrite it. */
const useOwnership = (id: AutoModalId) => {
  const addOwner = useAutoModalStore((state) => state.addOwner);
  const removeOwner = useAutoModalStore((state) => state.removeOwner);

  useEffect(() => {
    addOwner(id);
    return () => removeOwner(id);
  }, [id, addOwner, removeOwner]);
};

/**
 * Declare this modal in the queue and find out whether it may open.
 *
 * `settled` is what this component knows about itself: `false` while it is
 * still deciding or on screen, `true` once it knows it is not showing or the
 * user is done with it. Leaving the tree settles it, so a modal that never
 * reaches a decision cannot strand the ones behind it.
 */
export const useAutoModalSlot = (id: AutoModalId, settled: boolean): boolean => {
  const setSettled = useAutoModalStore((state) => state.setSettled);
  const isMyTurn = useAutoModalStore((state) => turnIsClear(state.settled, id));

  useOwnership(id);

  useEffect(() => {
    setSettled(id, settled);
  }, [id, settled, setSettled]);

  useEffect(() => () => setSettled(id, true), [id, setSettled]);

  return isMyTurn;
};

/**
 * Same slot, for a modal whose "I am done" is a moment rather than a value —
 * the permission ask, where what settles the turn is the browser dialog having
 * had its chance, and no rendered state says so.
 */
export const useAutoModalTurn = (id: AutoModalId) => {
  const setSettled = useAutoModalStore((state) => state.setSettled);
  const isMyTurn = useAutoModalStore((state) => turnIsClear(state.settled, id));

  useOwnership(id);

  useEffect(() => {
    setSettled(id, false);
    return () => setSettled(id, true);
  }, [id, setSettled]);

  const settle = useCallback(() => setSettled(id, true), [id, setSettled]);

  return { isMyTurn, settle };
};

/**
 * Hold a slot on another component's behalf, from an ancestor that mounts
 * earlier.
 *
 * `HomePage` needs this: every modal it owns mounts behind its `clockReady`
 * gate, so they are all one GET /time away, and by then the release notes —
 * which live in the layout above — would have shown and dismissed a note
 * already. Whoever actually owns the slot releases it.
 */
export const useReserveAutoModalSlot = (id: AutoModalId) => {
  const setSettled = useAutoModalStore((state) => state.setSettled);

  useEffect(() => {
    // Only a slot nobody owns. React runs a child's effects before its parent's,
    // so by the time this reservation runs the modal it speaks for may already
    // have mounted and answered — and overwriting that answer parks the whole
    // queue behind a modal that will never speak again, because its own effect
    // has no reason to re-run.
    if (!useAutoModalStore.getState().owners[id]) setSettled(id, false);
    return () => setSettled(id, true);
  }, [id, setSettled]);
};
