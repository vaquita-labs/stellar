'use client';

import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { usePollar } from '@pollar/react';
import { useState } from 'react';
import { useConfigStore } from '../stores';

/**
 * USDC sitting in the user's own wallet, or `null` while nobody knows yet.
 *
 * Only the USDC Blend accepts (same issuer): testnet carries several assets
 * called USDC from different issuers, and counting the wrong one produces a
 * balance the app cannot do anything with. A token with no Blend pool, or a
 * config that has not loaded, reads as `null` too — the same "unknown" a
 * balance still in flight gets, because a caller that treats either as zero
 * would see the real figure land later and read it as money arriving.
 *
 * A balance already read STANDS until a new one replaces it. Pollar throws its
 * data away on every `refreshBalance()` and reports `loading`, then `error` if
 * the read fails, so tidying this down to a plain `step !== 'loaded' → null`
 * brings both halves of the flicker back: the screen sees the money leave on a
 * re-read and arrive again when it lands. That is what shut the idle-funds
 * screen under the user's own finger — the tap fires the refresh
 * ({@link useIdleFunds}) and the screen closed before the click reached its
 * button — and what made a 5xx from Pollar un-dismiss that screen, since
 * `observeVaultIdle` reads a rise as new money.
 *
 * Serving a figure that may be stale is safe here because nothing spends it:
 * `useIdleFunds` reads the amount it deposits straight off the chain. This
 * number only decides whether to ask and what to print.
 *
 * A pure read of what the Pollar client already holds: it starts no fetch and
 * no poll of its own, so anywhere can ask without adding RPC traffic.
 * {@link useIdleFunds} is what keeps that balance fresh.
 */
export const useWalletUsdc = (): number | null => {
  const { walletBalance } = usePollar();
  const token = useConfigStore((s) => s.token);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);

  const issuer = blendConfigForToken(token)?.usdcIssuer;

  let reading: number | null = null;
  if (issuer && walletBalance.step === 'loaded') {
    const usdc = walletBalance.data.balances.find((b) => b.code?.toUpperCase() === 'USDC' && b.issuer === issuer);
    reading = usdc ? Number(usdc.available) : 0;
  }

  // `loading` and `error` both mean "we could not look just now". `idle` is the
  // one step with nothing behind it, and so is a token with no Blend pool.
  const unreadable = reading === null && !!issuer && walletBalance.step !== 'idle';

  // "Adjust state during render", the same pattern as `WalletSendModal`: the
  // memory has to be readable in this render, and an effect would publish the
  // blanked balance for one frame before restoring it — the very flicker this
  // exists to stop.
  if (!unreadable && lastLoaded !== reading) setLastLoaded(reading);

  return unreadable ? lastLoaded : reading;
};
