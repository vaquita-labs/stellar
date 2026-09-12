'use client';

import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { usePollar } from '@pollar/react';
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
 * A pure read of what the Pollar client already holds: it starts no fetch and
 * no poll of its own, so anywhere can ask without adding RPC traffic.
 * {@link useIdleFunds} is what keeps that balance fresh.
 */
export const useWalletUsdc = (): number | null => {
  const { walletBalance } = usePollar();
  const token = useConfigStore((s) => s.token);

  const issuer = blendConfigForToken(token)?.usdcIssuer;
  if (!issuer || walletBalance.step !== 'loaded') return null;

  const usdc = walletBalance.data.balances.find((b) => b.code?.toUpperCase() === 'USDC' && b.issuer === issuer);
  return usdc ? Number(usdc.available) : 0;
};
