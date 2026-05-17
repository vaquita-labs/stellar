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
// Constants
// ---------------------------------------------------------------------------

export const GENESIS_SAVER_CAP = 50;

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

/**
 * D1 — Genesis Saver: first GENESIS_SAVER_CAP unique wallet addresses to make
 * a confirmed deposit. Backend enforces the cap by counting issued claims.
 */
export async function checkGenesisSaverEligibility(walletAddress: string): Promise<boolean> {
  // Stop signing once we've issued cap-many active claims.
  const { count, error: countErr } = await supabase
    .from('badge_claims')
    .select('id', { count: 'exact', head: true })
    .eq('badge_type', 'genesis_saver')
    .eq('cycle_id', 0)
    .is('superseded_at', null);
  if (countErr) throw countErr;
  if ((count ?? 0) >= GENESIS_SAVER_CAP) return false;

  // Collect the first GENESIS_SAVER_CAP unique depositing wallets (FIFO by confirmed_at).
  const { data: deposits, error: depErr } = await supabase
    .from('deposits')
    .select('wallet_address, confirmed_at')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: true });
  if (depErr) throw depErr;

  const seen = new Set<string>();
  const first50: string[] = [];
  for (const { wallet_address } of deposits ?? []) {
    if (!seen.has(wallet_address)) {
      seen.add(wallet_address);
      first50.push(wallet_address);
      if (first50.length >= GENESIS_SAVER_CAP) break;
    }
  }
  return first50.includes(walletAddress);
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

/** Returns any claim (including superseded) for (wallet, badge_type, cycle_id). Used by the re-sign endpoint to confirm prior issuance for Cat A/B. */
export async function getAnyClaim(
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
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as BadgeClaimRecord | null;
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
