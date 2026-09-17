import { readUsdcBalanceRaw } from '@/networks/stellar/blendDirect';
import {
  formatTokenPrecise,
  formatUsdPrecise,
  MIN_IDLE_USDC,
  MIN_IDLE_USDC_DECIMALS,
  MIN_IDLE_USDC_STR,
} from '@/core-ui/helpers/numbers';
import { humanizeTxError } from '@/core-ui/helpers/txError';
import { toBaseUnits } from '@/networks/stellar/sorobanTx';
import { passiveDeposit } from '@/networks/stellar/vaultDirect';
import { formatBaseUnits } from '@/networks/stellar/vaultQueries';
import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import { toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore, useRampActiveStore, useAwaitingFundsStore, usePendingCreditStore } from '../stores';
import { useInvalidateAfterMoneyMove } from './useInvalidateAfterMoneyMove';
import { useWalletUsdc } from './useWalletUsdc';
import { requestWalletBalanceRefresh } from './useWalletBalanceRefresh';

// The floor for prompting and for spending a fee is `MIN_IDLE_USDC`, not the
// typed-amount minimum: nobody types a number here, so the only thing worth
// protecting is the fee of a transaction that moves dust.
//
// It is OURS, not the vault's. The vault has its own floor (#451
// AmountBelowMinDust), measured at ~0.000001 USDC on mainnet, so this one clears
// it by three orders of magnitude. If the chain's floor ever rose above it the
// deposit would fail anyway, but the screen says why instead of the generic.

// How often the custodial balance is re-read while the user is waiting for money
// to land. It can arrive on chain from outside the app — someone sends USDC to
// the address on the "Receive" screen — and without the poll nothing would
// notice until a reload.
//
// Five seconds because that is roughly how often Stellar closes a ledger: asking
// faster re-reads a state that cannot have changed, so it buys nothing and
// multiplies the calls. This only runs inside the two windows where money is
// actually expected (see the effect below), never as a background loop.
const IDLE_POLL_MS = 5_000;

/** Ceiling of one refresh a minute for the ones the user's own activity fires. */
const ACTIVITY_REFRESH_MS = 60_000;

/**
 * Detects idle USDC in the CUSTODIAL wallet (social login) and exposes the
 * action that puts it into the passive position (the DeFindex vault when the
 * flag is on, a direct supply to Blend otherwise). It does not sign on its own:
 * Pollar's custodial signature has to come out of a user gesture, or it throws
 * `SDK_AUTH_DPOP_USE_NONCE`, and moving someone's money is theirs to confirm.
 * So the real trigger is the button on the idle-funds screen
 * (`IdleFundsModal`); this hook only decides when to show it, and performs the
 * supply once the user approves.
 *
 * Guards: custodial only, per-wallet opt-out (ON by default), a minimum
 * threshold, an in-flight lock, and the `usePollarReadyStore` gate (session and
 * DPoP restored).
 */
export const useIdleFunds = () => {
  const { t } = useTranslation();
  const { wallet, walletBalance, refreshWalletBalance } = usePollar();
  const { walletAddress, token } = useConfigStore();
  const invalidateAfterMoneyMove = useInvalidateAfterMoneyMove();
  const ready = usePollarReadyStore((s) => s.ready);
  const awaitingFunds = useAwaitingFundsStore((s) => s.isAwaitingFunds);
  const rampActive = useRampActiveStore((s) => s.isRampActive);
  // Money has been bought and has not landed yet. Selected as a boolean on
  // purpose: `pendingUntil` is a fresh timestamp on every purchase and would
  // remount the poll at random, and all that matters here is whether there is
  // one at all.
  const pendingCredit = usePendingCreditStore((s) => s.pendingUntil != null);

  const [isInvesting, setIsInvesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Custodial only (social login). `external` = Freighter/xBull: left alone.
  const isCustodial = !!wallet && wallet.custody !== 'external';
  // "Not known yet" collapses to 0 here because `decided` below is what tells
  // the two apart, and a caller that sees a 0 while `decided` is false knows
  // not to act on it.
  const idle = useWalletUsdc() ?? 0;

  // (1) A SINGLE fetch when the home mounts or reloads: the home does not ask
  // for the balance by itself, so it is fetched once to spot idle money as soon
  // as the user walks in (the `IdleFundsModal` nudge). Waits for the custodial
  // wallet to be ready.
  useEffect(() => {
    if (!ready || !isCustodial || !walletAddress) return;
    void refreshWalletBalance();
  }, [ready, isCustodial, walletAddress, refreshWalletBalance]);

  // (2) The REPEATING poll: only while the user is waiting for money to come in
  // — watching their address on "Receive USDC", or the QR of a local-currency
  // purchase — because there it arrives from outside the app and nobody tells
  // us.
  //
  // It keeps running with the ramp ALREADY CLOSED as long as a credit is in
  // flight (`pendingCredit`). The provider calls the purchase done before the
  // USDC lands, so a poll that stopped when the modal closed left nobody
  // looking: the money arrives, the app still reads 0, the vault prompt never
  // opens and the header blinks until the timeout, with only a reload — which
  // fires fetch (1) — to break it out.
  //
  // The rest of the time the RPC is left alone. Guards: custodial plus a
  // restored Pollar session; paused while the tab is hidden and while a supply
  // is in flight. Coming back to the tab refreshes at once.
  useEffect(() => {
    if ((!awaitingFunds && !pendingCredit) || !ready || !isCustodial || !walletAddress) return;

    const tick = () => {
      if (inFlight.current || document.visibilityState === 'hidden') return;
      void refreshWalletBalance();
    };
    const id = setInterval(tick, IDLE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [awaitingFunds, pendingCredit, ready, isCustodial, walletAddress, refreshWalletBalance]);

  // (3) Refresh on the user's own rhythm, outside the two windows above: coming
  // back to the tab, and the first tap or key of each minute. It covers the
  // arrival no event in the app announces — someone sends USDC while the user
  // is on the map — which otherwise waits for the next home load.
  //
  // Throttled because every refresh is an RPC call: without it, dragging the
  // map would be dozens a minute to catch something that happens once a day.
  // The same throttle covers the tab: away for five seconds asks for nothing,
  // away for an hour asks immediately.
  const lastActivityRefresh = useRef(0);
  useEffect(() => {
    if (!ready || !isCustodial || !walletAddress) return;

    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      // Never from inside a sheet. Every tap and key there is aimed at the sheet,
      // and Pollar blanks its balance for the length of the read: the idle-funds
      // button goes disabled between `pointerdown` and `click`, and
      // `WalletSendModal` reads zero available — MAX dead, Send off, "Available:
      // 0.00" — while the user is typing an amount. The two screens that sit and
      // WAIT for money keep their own 5s poll above, which this does not touch.
      // Asked of the DOM like `useModalOnScreen`, so a sheet written later is
      // covered without anyone signing it up.
      if (document.querySelector('[role="dialog"]')) return;
      const now = Date.now();
      if (now - lastActivityRefresh.current < ACTIVITY_REFRESH_MS) return;
      lastActivityRefresh.current = now;
      void refreshWalletBalance();
    };

    document.addEventListener('visibilitychange', maybeRefresh);
    document.addEventListener('pointerdown', maybeRefresh, { passive: true });
    document.addEventListener('keydown', maybeRefresh);

    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      document.removeEventListener('pointerdown', maybeRefresh);
      document.removeEventListener('keydown', maybeRefresh);
    };
  }, [ready, isCustodial, walletAddress, refreshWalletBalance]);

  const invest = useCallback(async () => {
    if (inFlight.current || !walletAddress || !token) return;
    if (idle < MIN_IDLE_USDC) return;
    inFlight.current = true;
    setIsInvesting(true);
    setError(null);
    // Failing to read the balance is not a transaction error: `humanizeTxError`
    // would send it to the generic one, and the user would read "we could not
    // complete the transaction" when none was ever attempted.
    let readFailed = false;
    try {
      // HARD RULE: this moves the ENTIRE balance, down to the last decimal,
      // never rounded in either direction. Nobody typed an amount — the button
      // says "put it ALL to work" — so a figure rounded DOWN strands the
      // remainder in the wallet, where it reads as idle money and opens this
      // same screen again, and a figure rounded UP is a deposit the account
      // cannot cover, which fails at the contract.
      //
      // That is why the whole path is integers and exact strings, with no
      // `Number` anywhere in it: `readUsdcBalanceRaw` returns the i128 the token
      // contract holds, `formatBaseUnits` writes it out with every one of
      // `token.decimals` digits, and `toBaseUnits` inside `passiveDeposit`
      // parses that back to the same i128. The round trip is lossless.
      //
      // So: never source the amount from Pollar's cached `walletBalance` (a
      // float that has already lost precision, and may be stale), never send it
      // through `Number`, and never format it before it ships. The display
      // helpers — `formatTokenPrecise` and friends — are for the screen only;
      // the toast below is the one place a rounded figure belongs.
      let raw: bigint;
      try {
        raw = await readUsdcBalanceRaw(walletAddress);
      } catch (e) {
        // Never fall back to the cached figure: depositing a stale amount is
        // worse than depositing nothing.
        readFailed = true;
        throw e;
      }
      // The on-chain balance can have dropped below the floor since the screen
      // opened. Naming the floor is what keeps the button from looking dead:
      // stopping here without a word is indistinguishable from a broken button.
      if (raw < toBaseUnits(MIN_IDLE_USDC_STR, token.decimals)) {
        setError(
          t('deposit.receive.minDeposit', 'Minimum deposit: {{amount}} USDC.', {
            amount: formatUsdPrecise(MIN_IDLE_USDC, MIN_IDLE_USDC_DECIMALS),
          }),
        );
        return;
      }

      const amount = formatBaseUnits(raw, token.decimals);
      const { hash } = await passiveDeposit({
        address: walletAddress,
        amount,
        decimals: token.decimals,
        // Idle USDC already sitting in the user's wallet: new money to savings.
        flowKind: 'external_in',
      });
      console.info('[idle-funds] invested', { hash, amount });
      // Destination-agnostic on purpose: the router picks vault or Blend from
      // the flag, and the user has no reason to know the protocol underneath.
      // Two decimals and a float: this is the only reader of `amount` allowed to
      // round it, because it is a sentence, not a transaction.
      toast.success(
        t('idleFunds.toast', 'We put ${{amount}} to work', {
          amount: formatTokenPrecise(Number(amount), 2),
        }),
      );
      await invalidateAfterMoneyMove();
      // The on-chain snapshot that feeds the vault's XP: this flow is signed
      // entirely in the browser, so there is no server handler to notice it.
      void requestWalletBalanceRefresh(walletAddress, { force: true });
    } catch (e) {
      // The custodial signature can fail on the session (nonce) or on missing
      // gas (XLM), and the vault can reject on its own dust floor. The error
      // goes on the screen and the user may retry; nothing is swept away here.
      // The raw error is logged beside the title: when Pollar swallows the
      // contract error, it is the only thing left to say what happened.
      console.warn('[idle-funds] invest failed', humanizeTxError(e, t).raw, e);
      setError(
        readFailed
          ? t('idleFunds.balanceUnavailable', "We couldn't read your balance right now. Try again in a moment.")
          : humanizeTxError(e, t).title,
      );
      throw e;
    } finally {
      inFlight.current = false;
      setIsInvesting(false);
    }
  }, [walletAddress, token, idle, invalidateAfterMoneyMove, t]);

  // Show the idle-funds screen? Custodial, session ready, and idle USDC over
  // the threshold. It is a closable nudge, so it needs no opt-out.
  //
  // With a ramp in progress it does NOT prompt. On the off-ramp that USDC has
  // just left the vault to pay the ramp, and sending it back leaves the
  // provider with nothing to collect and the withdrawal hanging. On the on-ramp
  // the purchase can settle with the payment screen still open, and covering
  // that screen interrupts something the user is in the middle of. Once the
  // ramp closes the flag goes off and the prompt is offered as it is after any
  // other deposit.
  const shouldPrompt = ready && isCustodial && idle >= MIN_IDLE_USDC && !rampActive;

  // Is it KNOWN yet whether there is idle money? While the Pollar session is
  // restoring, or the balance has not loaded, a false `shouldPrompt` is not
  // "there is nothing": it is "we have not asked yet". The difference matters to
  // whoever waits on this slot — the version notes, through [[auto-modals]] —
  // which would otherwise get ahead of the prompt on every load.
  //
  // `error` counts as decided: it is a TERMINAL state of the balance, so we are
  // never going to find out whether there is idle money. Without that branch a
  // failed read (RPC down, a 5xx from Pollar) held the slot forever — `decided`
  // false and `shouldPrompt` false too, so nobody released it — and the version
  // notes never appeared on the home for the whole session.
  const decided = ready && (!isCustodial || walletBalance.step === 'loaded' || walletBalance.step === 'error');

  return { idle, shouldPrompt, decided, invest, isInvesting, error, clearError: () => setError(null) };
};
