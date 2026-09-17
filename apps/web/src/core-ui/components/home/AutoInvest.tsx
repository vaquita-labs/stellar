'use client';

import { useEffect, useState } from 'react';
import { useIdleFunds } from '../../hooks/useAutoInvest';
import { useModalOnScreen } from '../../hooks/useModalOnScreen';
import {
  dismissVaultPrompt,
  markVaultInvestSettling,
  observeVaultIdle,
  useAutoModalSlot,
  usePendingCreditStore,
  useVaultPromptStore,
} from '../../stores';
import { useModalPresence } from '../molecules/AppModal';
import { IdleFundsModal } from './IdleFundsModal';

/**
 * The idle-money gate's orchestrator, with no UI of its own. It runs
 * `useIdleFunds` on the home: when idle USDC turns up in a custodial wallet, it
 * opens the full-screen `IdleFundsModal` for the user to invest it. Investing
 * drops the idle figure to 0 and the screen closes on its own.
 */
export function AutoInvest() {
  const { idle, shouldPrompt, decided, invest, isInvesting, error, clearError } = useIdleFunds();
  const [open, setOpen] = useState(false);
  // Once the user has closed it — or the investment failed and they closed it —
  // it does not open again until NEW money comes in (the idle figure rises), so
  // nobody is caught in a loop or pushed into a decision.
  //
  // It lives outside the component ([[vault-prompt]]) because "they already
  // answered" has to survive a remount: this tree rebuilds itself on a warm
  // refresh, and with the flag in component state the screen the user had just
  // closed opened straight back up.
  const dismissed = useVaultPromptStore((state) => state.dismissed);

  // The idle balance rising is THE signal that money in flight has landed, so
  // the header's blink is turned off from here too. Turning it off when this
  // screen opens is not enough: a small purchase — under the floor for
  // investing — still settles and never opens anything, leaving the balance
  // blinking until the 15-minute expiry with the money already in plain sight.
  const clearPendingCredit = usePendingCreditStore((s) => s.clearPendingCredit);

  // The place in the queue is given back once the user has closed the screen
  // (`dismissed`, which also covers investing and closing it) or once we know
  // there is nothing to offer. `HomePage` reserves it on entry, because this
  // component only mounts after the clock syncs and by then the version note
  // would already have been shown.
  //
  // `ourTurn` is everything ahead of it being out of the way: the notification
  // ask, the tour and the welcome gift. The order is in [[auto-modals]].
  const settled = !open && (dismissed || (decided && !shouldPrompt));
  const ourTurn = useAutoModalSlot('vault-prompt', settled);

  // Only KNOWN balances are folded in. `idle` collapses "not known yet" to 0, and
  // a rise is what re-arms the prompt, so a reading taken before the balance has
  // ever loaded would read as money arriving and open the screen on its own.
  useEffect(() => {
    if (!decided) return;
    if (observeVaultIdle(idle)) clearPendingCredit();
  }, [decided, idle, clearPendingCredit]);

  // This screen is a full-screen interruption, so it may not land on top of what
  // the user is already doing. That rule also settles the serious case: every
  // flow that parks money in the wallet mid-way — the two-hop withdrawal, a
  // locked position moving to the vault, the migration — runs behind a sheet
  // that CANNOT be closed while its transaction is in flight
  // (`isDismissable={false}` plus `hideClose`, the rule in every money sheet).
  // So "nothing on screen" also means "no transaction in flight", and asking the
  // screen covers the flows written after this line too.
  //
  // Without the guard the prompt opened over the second leg of a withdrawal,
  // offering to invest the money that was only passing through; accepting it
  // sent that money back to the vault and the payment bounced underfunded,
  // leaving the withdrawal half done.
  const waitingToOpen = shouldPrompt && !dismissed && ourTurn && !open;
  // Asked only in order to OPEN. Asked while it is open it would see its own
  // dialog and close itself on the next tick.
  const modalOnScreen = useModalOnScreen(waitingToOpen);

  // Closing waits for a KNOWN balance. `shouldPrompt` drops both when the idle
  // money is really gone — invested, spent, a ramp claiming it — and while a
  // re-read is in flight, and `decided` is the only thing that tells those
  // apart. Drop it and the screen shuts itself on every refresh and comes
  // straight back when the reading lands.
  useEffect(() => {
    if (shouldPrompt && !dismissed && ourTurn && !modalOnScreen) setOpen(true);
    else if (decided && !shouldPrompt) setOpen(false);
  }, [shouldPrompt, dismissed, ourTurn, modalOnScreen, decided]);

  // And when the screen opens, which is the expected ending: by then the ramp
  // closed long ago and cannot turn the blink off itself.
  useEffect(() => {
    if (open) clearPendingCredit();
  }, [open, clearPendingCredit]);

  const mounted = useModalPresence(open);

  const handleClose = () => {
    setOpen(false);
    dismissVaultPrompt();
    clearError();
  };

  const handleInvest = async () => {
    try {
      await invest();
      setOpen(false);
      // The user has answered for THIS money. Without it the screen reopens
      // instantly: `shouldPrompt` stays true until the balance refresh lands,
      // and the effect above puts the screen back the moment the dialog leaves
      // the DOM. It is offered again when new money comes in.
      dismissVaultPrompt();
      markVaultInvestSettling();
    } catch {
      // The failure is already in `error` and shown on the screen, which stays
      // open — dismissable now — to retry or close.
    }
  };

  if (!mounted) return null;

  return (
    <IdleFundsModal
      open={open}
      onOpenChange={handleClose}
      idle={idle}
      onInvest={handleInvest}
      investing={isInvesting}
      error={error}
      // A closable nudge: they can always close it. On close the money stays in
      // their wallet, available and uninvested — it is not moved or forced.
      dismissable
    />
  );
}
