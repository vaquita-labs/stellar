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
 * 1. Claim achievement off-chain (idempotent — 409 is silently ignored)
 * 2. Fetch signed claim from the API
 * 3. Refresh signature if expired
 * 4. Call mintBadge via Pollar (wallet prompt)
 * 5. Confirm the mint on the server
 */
export const useMintBadge = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useNetworkConfigStore();
  const networkName = network?.name ?? '';
  const badgesContractAddress = network?.badgesContractAddress;
  const baseUrl = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1`;

  return useMutation<{ hash: string; coinReward: number }, Error, string>({
    mutationFn: async (badgeType: string) => {
      if (!badgesContractAddress) {
        throw new Error('Badge contract address not configured for this network');
      }
      if (!walletAddress) throw new Error('No connected wallet');

      // Step 1: claim achievement off-chain (idempotent)
      const claimRes = await fetch(
        `${baseUrl}/profile/network/${networkName}/wallet/${encodeURIComponent(walletAddress)}/achievements/${encodeURIComponent(badgeType)}/claim`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!claimRes.ok && claimRes.status !== 409) {
        const body = await claimRes.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to claim achievement (${claimRes.status})`);
      }
      const claimBody = claimRes.status !== 409 ? await claimRes.json().catch(() => null) : null;
      const coinReward: number = claimBody?.data?.coinReward ?? 0;

      // Step 2: fetch signed claim
      const signRes = await fetch(
        `${baseUrl}/claim/${encodeURIComponent(networkName)}?type=${encodeURIComponent(badgeType)}&wallet=${encodeURIComponent(walletAddress)}`,
      );
      if (!signRes.ok) {
        const body = await signRes.json().catch(() => null);
        throw new Error(body?.message ?? `Failed to fetch badge claim (${signRes.status})`);
      }
      const signBody = await signRes.json();
      let claim: BadgeClaimPayload = signBody.data;

      // Step 3: refresh if signature expired
      const nowUnix = Math.floor(Date.now() / 1000);
      if (claim.expiry <= nowUnix) {
        const refreshRes = await fetch(`${baseUrl}/claim/${encodeURIComponent(networkName)}/refresh`, {
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

      // Step 4: mint on-chain via Pollar
      const { hash } = await mintBadge({
        address: walletAddress,
        badgeContractId: badgesContractAddress,
        badgeType,
        cycleId: claim.cycle_id,
        expiry: claim.expiry,
        signature: claim.signature,
      });

      // Step 5: confirm on server
      await fetch(`${baseUrl}/claim/${encodeURIComponent(networkName)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badge_type: badgeType,
          wallet: walletAddress,
          cycle_id: claim.cycle_id,
          transaction_hash: hash,
        }),
      });

      return { hash, coinReward };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['minted-badges', networkName, walletAddress],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-achievements'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-rewards'],
      });
    },
  });
};
