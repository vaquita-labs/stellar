import type { ClaimAchievementResponseDTO } from '@/core-ui/types';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';

/** Signed claim returned by the API and consumed by the on-chain `mintBadge` call. */
export interface BadgeClaimPayload {
  badge_type: string;
  cycle_id: number;
  expiry: number;
  signature: string;
  contract_symbol: string;
}

const enc = encodeURIComponent;
const API_BASE = `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1`;

async function authJson<T>(
  wallet: string,
  path: string,
  init: RequestInit,
  okStatuses: number[] = [],
): Promise<T | null> {
  const response = await authFetch(`${API_BASE}${path}`, init, wallet);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (okStatuses.includes(response.status)) return null;
    throw new Error(body?.message ?? body?.error ?? `Request failed (${response.status})`);
  }

  return body?.data ?? null;
}

/**
 * Claim an achievement off-chain. Idempotent: a 409 ("already claimed") is not
 * an error — it resolves to `null` so callers can treat it as a no-op.
 */
export function claimAchievement(wallet: string, achievementKey: string): Promise<ClaimAchievementResponseDTO | null> {
  return authJson<ClaimAchievementResponseDTO>(
    wallet,
    `/wallets/${enc(wallet)}/badges/${enc(achievementKey)}/claim`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    [409],
  );
}

/** Fetch the signed claim needed to mint a badge on-chain. */
export function fetchSignedClaim(wallet: string, badgeType: string): Promise<BadgeClaimPayload | null> {
  return authJson<BadgeClaimPayload>(
    wallet,
    `/wallets/${enc(wallet)}/badges/${enc(badgeType)}/voucher`,
    { method: 'GET' },
  );
}

/** Re-sign a claim whose signature has expired. */
export function refreshSignedClaim(input: {
  wallet: string;
  badge_type: string;
  cycle_id: number;
}): Promise<BadgeClaimPayload | null> {
  return authJson<BadgeClaimPayload>(
    input.wallet,
    `/wallets/${enc(input.wallet)}/badges/${enc(input.badge_type)}/voucher/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycle_id: input.cycle_id }),
    },
  );
}

/** Tell the server the on-chain mint landed, so it can finalise the claim. */
export function confirmMint(input: {
  badge_type: string;
  wallet: string;
  cycle_id: number;
  transaction_hash: string;
}): Promise<ClaimAchievementResponseDTO | null> {
  return authJson<ClaimAchievementResponseDTO>(
    input.wallet,
    `/wallets/${enc(input.wallet)}/badges/${enc(input.badge_type)}/mint`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycle_id: input.cycle_id,
        transaction_hash: input.transaction_hash,
      }),
    },
  );
}
