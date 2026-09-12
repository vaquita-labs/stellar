'use client';

import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Query prefixes that a deposit or a withdrawal makes stale.
 *
 * `profile` is the wide one, and the reason this list exists: badges, gold
 * coins, XP, streak and the profile row all hang off it, and moving money
 * changes every one of them. Leaving it out is what kept `first_deposit` from
 * being offered until the next time the home mounted.
 */
const MONEY_MOVE_KEYS = [['deposit'], ['blend-position'], ['defindex-vault-position'], ['profile']];

/**
 * Refresh everything money touches, from the single place that knows the list.
 *
 * Every flow that moves funds — the deposit panel, the local-currency ramp, the
 * portfolio's invest and withdraw sheets, the idle-funds supply, the passive
 * migration — used to invalidate its own hand-picked subset, and no two of them
 * agreed. Call this instead once the transaction is confirmed.
 */
export const useInvalidateAfterMoneyMove = () => {
  const queryClient = useQueryClient();
  const { refreshWalletBalance } = usePollar();

  // Async so a caller that needs the wallet balance settled before it reads it
  // again can await; the query invalidations never need waiting on.
  return useCallback(async () => {
    for (const queryKey of MONEY_MOVE_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
    // Not a react-query entry: the wallet balance lives in the Pollar client,
    // and the money that just moved came out of (or landed in) it.
    await refreshWalletBalance();
  }, [queryClient, refreshWalletBalance]);
};
