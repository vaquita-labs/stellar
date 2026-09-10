'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useQuery } from '@tanstack/react-query';

/**
 * Invite-a-friend summary for the signed-in wallet.
 *
 * `authFetch`, not the plain `getJson` helper: the endpoint reads the wallet
 * from the session token now, because the answer includes who a user brought in
 * and reading it is also what mints their code.
 *
 * The payout fields the API still returns (`apyBonus`, `totalEarnings`,
 * `pendingEarnings`) are deliberately not surfaced here. Nothing applies the APY
 * bonus to a real rate and no payout ledger exists, so a screen that showed them
 * would be promising something the product does not honour.
 */
export interface ReferralSummary {
  /** The short code this wallet shares. Always present once the profile exists. */
  code: string;
  /** Friends who signed up through this code. */
  referrals: number;
  /** How many of them are currently saving, in either product. */
  activeReferrals: number;
}

const referralKey = (walletAddress?: string | null) => ['referral', 'summary', walletAddress] as const;

const BASE = () => `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/referrals`;

/**
 * Account data, not world/game data, so the global `staleTime: Infinity` is
 * overridden: a friend can join from another device and the count should be
 * right on reopen, not on reload.
 */
export const useReferralSummary = () => {
  const walletAddress = useConfigStore((s) => s.walletAddress);

  return useQuery<ReferralSummary>({
    queryKey: referralKey(walletAddress),
    queryFn: async () => {
      const response = await authFetch(`${BASE()}/wallet/${walletAddress}`, { method: 'GET' }, walletAddress!);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.status !== 'success') {
        throw new Error(body?.message || 'Failed to load referral summary');
      }
      const data = body.data as ReferralSummary;
      return {
        code: data?.code ?? '',
        referrals: data?.referrals ?? 0,
        activeReferrals: data?.activeReferrals ?? 0,
      };
    },
    enabled: !!walletAddress,
    staleTime: 30_000,
  });
};
