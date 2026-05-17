import { supabase } from '../../lib/supabase';

export interface BadgeClaimRecord {
  id: string;
  wallet_address: string;
  badge_type: string;
  cycle_id: number;
  expiry: string;         // ISO timestamp
  signature: string;      // hex
  created_at: string;
  superseded_at: string | null;
}

export interface BadgeClaimPayload {
  badge_type: string;
  cycle_id: number;
  expiry: number;         // Unix seconds
  signature: string;      // hex
}

// ---------------------------------------------------------------------------
// Eligibility checks
// ---------------------------------------------------------------------------

/**
 * C1 — Primera Vaquita: wallet has at least one on-time confirmed withdrawal
 * (reward > 0 indicates on-time; early withdrawals have reward = null or 0).
 */
export async function checkPrimeraVaquitaEligibility(walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deposits')
    .select('id, withdrawals(id, status, reward)')
    .eq('wallet_address', walletAddress)
    .eq('status', 'confirmed');

  if (error) throw error;

  return (data ?? []).some((deposit: any) =>
    (deposit.withdrawals ?? []).some(
      (w: any) => w.status === 'confirmed' && w.reward != null && Number(w.reward) > 0,
    ),
  );
}

// ---------------------------------------------------------------------------
// Claim storage
// ---------------------------------------------------------------------------

export async function getActiveBadgeClaim(
  walletAddress: string,
  badgeType: string,
  cycleId: number,
): Promise<BadgeClaimRecord | null> {
  const { data, error } = await supabase
    .from('badge_claims')
    .select('*')
    .eq('wallet_address', walletAddress)
    .eq('badge_type', badgeType)
    .eq('cycle_id', cycleId)
    .is('superseded_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as BadgeClaimRecord | null;
}

export async function storeBadgeClaim(claim: {
  walletAddress: string;
  badgeType: string;
  cycleId: number;
  expiry: number;
  signature: string;
}): Promise<BadgeClaimRecord> {
  const { data, error } = await supabase
    .from('badge_claims')
    .insert({
      wallet_address: claim.walletAddress,
      badge_type: claim.badgeType,
      cycle_id: claim.cycleId,
      expiry: new Date(claim.expiry * 1000).toISOString(),
      signature: claim.signature,
    })
    .select()
    .single();

  if (error) throw error;
  return data as BadgeClaimRecord;
}

export async function supersedeBadgeClaim(claimId: string): Promise<void> {
  const { error } = await supabase
    .from('badge_claims')
    .update({ superseded_at: new Date().toISOString() })
    .eq('id', claimId);
  if (error) throw error;
}

/** Convert a stored BadgeClaimRecord to the API response payload. */
export function toClaimPayload(record: BadgeClaimRecord): BadgeClaimPayload {
  return {
    badge_type: record.badge_type,
    cycle_id: record.cycle_id,
    expiry: Math.floor(new Date(record.expiry).getTime() / 1000),
    signature: record.signature,
  };
}
