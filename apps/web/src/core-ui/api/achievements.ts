import type { ClaimAchievementResponseDTO } from '@/core-ui/types';

import { getJson, postJson } from './http';

/** Signed claim returned by the API and consumed by the on-chain `mintBadge` call. */
export interface BadgeClaimPayload {
  badge_type: string;
  cycle_id: number;
  expiry: number;
  signature: string;
  contract_symbol: string;
}

const enc = encodeURIComponent;

/**
 * Claim an achievement off-chain. Idempotent: a 409 ("already claimed") is not
 * an error — it resolves to `null` so callers can treat it as a no-op.
 */
export function claimAchievement(wallet: string, achievementKey: string): Promise<ClaimAchievementResponseDTO | null> {
  return postJson<ClaimAchievementResponseDTO>(
    `/profile/wallet/${enc(wallet)}/achievements/${enc(achievementKey)}/claim`,
    undefined,
    [409],
  );
}

/** Fetch the signed claim needed to mint a badge on-chain. */
export function fetchSignedClaim(wallet: string, badgeType: string): Promise<BadgeClaimPayload | null> {
  return getJson<BadgeClaimPayload>(`/claim?type=${enc(badgeType)}&wallet=${enc(wallet)}`);
}

/** Re-sign a claim whose signature has expired. */
export function refreshSignedClaim(input: {
  wallet: string;
  badge_type: string;
  cycle_id: number;
}): Promise<BadgeClaimPayload | null> {
  return postJson<BadgeClaimPayload>('/claim/refresh', input);
}

/** Tell the server the on-chain mint landed, so it can finalise the claim. */
export function confirmMint(input: {
  badge_type: string;
  wallet: string;
  cycle_id: number;
  transaction_hash: string;
}): Promise<unknown> {
  return postJson('/claim/confirm', input);
}
