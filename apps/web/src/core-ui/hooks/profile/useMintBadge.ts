'use client';

import { confirmMint, fetchSignedClaim, refreshSignedClaim } from '@/core-ui/api/achievements';
import { useConfigStore } from '@/core-ui/stores';
import { mintBadge } from '@/networks/stellar/sorobanTx';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Mutation that runs the full badge mint flow:
 * 1. Fetch/create a signed claim from the API
 * 2. Refresh signature if expired
 * 3. Call mintBadge via Pollar (wallet prompt)
 * 4. Confirm the mint on the server, which finalizes rewards
 */
export const useMintBadge = () => {
  const queryClient = useQueryClient();
  const { network, walletAddress } = useConfigStore();
  const networkName = network?.networkName ?? '';
  const badgesContractAddress = network?.badgesContractAddress;

  return useMutation<{ hash: string; coinReward: number }, Error, string>({
    mutationFn: async (badgeType: string) => {
      if (!badgesContractAddress) {
        throw new Error('Badge contract address not configured for this network');
      }
      if (!walletAddress) throw new Error('No connected wallet');

      let claim = await fetchSignedClaim(walletAddress, badgeType);
      if (!claim) throw new Error('Failed to fetch badge claim');

      // Step 2: refresh if signature expired
      const nowUnix = Math.floor(Date.now() / 1000);
      if (claim.expiry <= nowUnix) {
        const refreshed = await refreshSignedClaim({
          wallet: walletAddress,
          badge_type: badgeType,
          cycle_id: claim.cycle_id,
        });
        if (!refreshed) throw new Error('Failed to refresh badge claim');
        claim = refreshed;
      }

      // Step 3: mint on-chain via Pollar — use tier (Soroban Symbol) not the key
      const { hash } = await mintBadge({
        address: walletAddress,
        badgeContractId: badgesContractAddress,
        badgeType: claim.contract_symbol,
        cycleId: claim.cycle_id,
        expiry: claim.expiry,
        signature: claim.signature,
      });

      // Step 4: confirm on server and receive the finalized reward
      const finalized = await confirmMint({
        badge_type: badgeType,
        wallet: walletAddress,
        cycle_id: claim.cycle_id,
        transaction_hash: hash,
      });

      return { hash, coinReward: finalized?.coinReward ?? 0 };
    },
    onSuccess: () => {
      // `minted` is folded into the profile-achievements list, so invalidating
      // it refreshes the minted state too (see useMintedBadges).
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-achievements'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-rewards'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', networkName, walletAddress, 'profile-experience'],
      });
    },
  });
};
