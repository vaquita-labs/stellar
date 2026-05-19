'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { mintBadge } from '@/networks/stellar/sorobanTx';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface BadgeClaimPayload {
  badge_type: string;
  cycle_id: number;
  expiry: number;
  signature: string;
}

/**
 * Mutation that runs the full badge mint flow:
 * 1. Fetch signed claim from the API
 * 2. Refresh signature if expired
 * 3. Call mintBadge via Pollar (wallet prompt)
 * 4. Confirm the mint on the server
 * 5. Invalidate the minted-badges query
 */
export const useMintBadge = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useNetworkConfigStore();
  const networkName = network?.name ?? '';
  const badgesContractAddress = network?.badgesContractAddress;
  const baseUrl = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1`;

  return useMutation<{ hash: string }, Error, string>({
    mutationFn: async (badgeType: string) => {
      if (!badgesContractAddress) {
        throw new Error('Badge contract address not configured for this network');
      }
      if (!walletAddress) throw new Error('No connected wallet');

      // Step 1: fetch signed claim
      const claimRes = await fetch(
        `${baseUrl}/claim/${networkName}?type=${encodeURIComponent(badgeType)}&wallet=${encodeURIComponent(walletAddress)}`,
      );
      if (!claimRes.ok) {
        const body = await claimRes.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to fetch badge claim (${claimRes.status})`);
      }
      const claimBody = await claimRes.json();
      let claim: BadgeClaimPayload = claimBody.data;

      // Step 2: refresh if signature expired
      const nowUnix = Math.floor(Date.now() / 1000);
      if (claim.expiry <= nowUnix) {
        const refreshRes = await fetch(`${baseUrl}/claim/${networkName}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: walletAddress,
            badge_type: badgeType,
            cycle_id: claim.cycle_id,
          }),
        });
        if (!refreshRes.ok) {
          const body = await refreshRes.json().catch(() => null);
          throw new Error(body?.message ?? `Failed to refresh badge claim (${refreshRes.status})`);
        }
        const refreshBody = await refreshRes.json();
        claim = refreshBody.data;
      }

      // Step 3: mint on-chain via Pollar
      const { hash } = await mintBadge({
        address: walletAddress,
        badgeContractId: badgesContractAddress,
        badgeType,
        cycleId: claim.cycle_id,
        expiry: claim.expiry,
        signature: claim.signature,
      });

      // Step 4: confirm on server
      await fetch(`${baseUrl}/claim/${networkName}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badge_type: badgeType,
          wallet: walletAddress,
          cycle_id: claim.cycle_id,
          transaction_hash: hash,
        }),
      });

      return { hash };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['minted-badges', networkName, walletAddress],
      });
    },
  });
};
