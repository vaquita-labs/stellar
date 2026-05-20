import { supabase } from '../../lib/supabase';
import {
  checkPrimeraVaquitaEligibility,
  getAnyClaim,
  storeBadgeClaim,
} from './claims';
import { getBadgeSigningKeypair, makeClaimExpiry, signBadgeClaim } from './signer';

// ---------------------------------------------------------------------------
// Lock-period constants (seconds)
// ---------------------------------------------------------------------------

const THREE_MONTHS_S = 7_776_000;
const SIX_MONTHS_S = 15_552_000;

function isLockPeriod(raw: number, targetSeconds: number): boolean {
  const normalized = raw >= 1_000_000 ? Math.trunc(raw / 1000) : raw;
  return normalized === targetSeconds;
}

// ---------------------------------------------------------------------------
// Eligibility checks
// ---------------------------------------------------------------------------

/**
 * Maratonista: first completed 6-month cycle (on-time withdrawal, reward > 0).
 */
export async function checkMaratonistEligibility(walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deposits')
    .select('lock_period, withdrawals(id, status, reward)')
    .eq('wallet_address', walletAddress)
    .eq('status', 'confirmed');

  if (error) throw error;

  return (data ?? []).some((deposit: any) => {
    if (!isLockPeriod(Number(deposit.lock_period ?? 0), SIX_MONTHS_S)) return false;
    return (deposit.withdrawals ?? []).some(
      (w: any) => w.status === 'confirmed' && w.reward != null && Number(w.reward) > 0,
    );
  });
}

/**
 * Trimestral: first completed 3-month cycle (on-time withdrawal, reward > 0).
 */
export async function checkTrimestralEligibility(walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deposits')
    .select('lock_period, withdrawals(id, status, reward)')
    .eq('wallet_address', walletAddress)
    .eq('status', 'confirmed');

  if (error) throw error;

  return (data ?? []).some((deposit: any) => {
    if (!isLockPeriod(Number(deposit.lock_period ?? 0), THREE_MONTHS_S)) return false;
    return (deposit.withdrawals ?? []).some(
      (w: any) => w.status === 'confirmed' && w.reward != null && Number(w.reward) > 0,
    );
  });
}

/**
 * Veterano: 12+ completed cycles without early withdrawal (each reward > 0).
 */
export async function checkVeteranoEligibility(walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deposits')
    .select('id, withdrawals(id, status, reward)')
    .eq('wallet_address', walletAddress)
    .eq('status', 'confirmed');

  if (error) throw error;

  const completedCycles = (data ?? []).filter((deposit: any) =>
    (deposit.withdrawals ?? []).some(
      (w: any) => w.status === 'confirmed' && w.reward != null && Number(w.reward) > 0,
    ),
  ).length;

  return completedCycles >= 12;
}

/**
 * Disciplinado: wallet has confirmed deposits on at least 30 consecutive calendar days.
 * "Activity" is defined as any deposit confirmed on a given day.
 */
export async function checkDisciplinadoEligibility(walletAddress: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('deposits')
    .select('confirmed_at')
    .eq('wallet_address', walletAddress)
    .eq('status', 'confirmed')
    .not('confirmed_at', 'is', null);

  if (error) throw error;

  const dateSet = new Set<string>();
  for (const row of data ?? []) {
    const raw = (row as { confirmed_at: string | null }).confirmed_at;
    if (raw) dateSet.add(raw.slice(0, 10));
  }

  return hasConsecutiveDays(Array.from(dateSet).sort(), 30);
}

function hasConsecutiveDays(sortedDates: string[], streak: number): boolean {
  if (sortedDates.length < streak) return false;
  let count = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const diffDays =
      (new Date(sortedDates[i]!).getTime() - new Date(sortedDates[i - 1]!).getTime()) / 86_400_000;
    if (diffDays === 1) {
      count++;
      if (count >= streak) return true;
    } else {
      count = 1;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Monitor entry point
// ---------------------------------------------------------------------------

const AUTO_BADGES: Array<{ badgeType: string; check: (wallet: string) => Promise<boolean> }> = [
  { badgeType: 'primera_vaquita', check: checkPrimeraVaquitaEligibility },
  { badgeType: 'maratonista', check: checkMaratonistEligibility },
  { badgeType: 'trimestral', check: checkTrimestralEligibility },
  { badgeType: 'veterano', check: checkVeteranoEligibility },
  { badgeType: 'disciplinado', check: checkDisciplinadoEligibility },
];

/**
 * Evaluates all milestone conditions for a wallet and issues signed claims
 * for any newly eligible badges. Idempotent: skips badges where a claim already exists.
 * Called automatically after each on-time withdrawal confirmation.
 */
export async function evaluateBadgeMilestones(walletAddress: string): Promise<void> {
  let keypair: ReturnType<typeof getBadgeSigningKeypair>;
  try {
    keypair = getBadgeSigningKeypair();
  } catch {
    return; // BADGE_SIGNING_SEED not configured — skip silently
  }

  for (const { badgeType, check } of AUTO_BADGES) {
    try {
      const existing = await getAnyClaim(walletAddress, badgeType, 0);
      if (existing) continue;

      const eligible = await check(walletAddress);
      if (!eligible) continue;

      const expiry = makeClaimExpiry();
      const signature = signBadgeClaim(walletAddress, badgeType, 0, expiry, keypair);
      await storeBadgeClaim({ walletAddress, badgeType, cycleId: 0, expiry, signature });
      console.info(`[badge-monitor] Issued ${badgeType} claim for ${walletAddress}`);
    } catch (err) {
      console.error(`[badge-monitor] Error evaluating ${badgeType} for ${walletAddress}`, err);
    }
  }
}
