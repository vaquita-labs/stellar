import { prisma } from '@vaquita/db';
import type { BadgeClaim as PrismaBadgeClaim } from '@vaquita/db';

const toBadgeClaimRecord = (c: PrismaBadgeClaim): BadgeClaimRecord => ({
  id: c.id,
  wallet_address: c.walletAddress,
  badge_type: c.badgeType,
  cycle_id: c.cycleId,
  expiry: c.expiresAt.toISOString(),
  signature: c.signature,
  created_at: c.createdAt.toISOString(),
  superseded_at: c.supersededAt ? c.supersededAt.toISOString() : null,
  confirmed_at: c.confirmedAt ? c.confirmedAt.toISOString() : null,
  transaction_hash: c.transactionHash ?? null,
});

export interface BadgeClaimRecord {
  id: string;
  wallet_address: string;
  badge_type: string;
  cycle_id: number;
  expiry: string;              // ISO timestamp
  signature: string;           // base64-encoded Ed25519 signature
  created_at: string;
  superseded_at: string | null;
  confirmed_at: string | null;
  transaction_hash: string | null;
}

export interface BadgeClaimPayload {
  badge_type: string;
  cycle_id: number;
  expiry: number;           // Unix seconds
  signature: string;        // hex
  contract_symbol: string;  // achievements.tier — valid Soroban Symbol passed to mint_badge
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GENESIS_SAVER_CAP = 50;

/** Number of days after mainnet launch in which D2 (Mainnet Pioneer) claims are open. */
export const MAINNET_PIONEER_WINDOW_DAYS = 7;

/**
 * Returns the mainnet launch timestamp in Unix milliseconds, or null if not configured.
 * Set MAINNET_LAUNCH_TIMESTAMP to a Unix ms value (e.g. Date.parse('2026-06-01T00:00:00Z')).
 */
export function getMainnetLaunchTimestampMs(): number | null {
  const raw = process.env.MAINNET_LAUNCH_TIMESTAMP;
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

// ---------------------------------------------------------------------------
// Eligibility checks
// ---------------------------------------------------------------------------

/**
 * C1 — Primera Vaquita: wallet has at least one on-time confirmed withdrawal
 * (reward > 0 indicates on-time; early withdrawals have reward = null or 0).
 */
export async function checkPrimeraVaquitaEligibility(walletAddress: string): Promise<boolean> {
  const data = await prisma.deposit.findMany({
    where: { walletAddress, status: 'confirmed', deletedAt: null },
    select: { withdrawals: { select: { status: true, reward: true } } },
  });

  return data.some((deposit) =>
    deposit.withdrawals.some(
      (w) => w.status === 'confirmed' && w.reward != null && w.reward.toNumber() > 0,
    ),
  );
}

/**
 * D1 — Genesis Saver: first GENESIS_SAVER_CAP unique wallet addresses to make
 * a confirmed deposit. Backend enforces the cap by counting issued claims.
 */
export async function checkGenesisSaverEligibility(walletAddress: string): Promise<boolean> {
  // Stop signing once we've issued cap-many active claims.
  const count = await prisma.badgeClaim.count({
    where: { badgeType: 'genesis_saver', cycleId: 0, supersededAt: null, deletedAt: null },
  });
  if (count >= GENESIS_SAVER_CAP) return false;

  // Collect the first GENESIS_SAVER_CAP unique depositing wallets (FIFO by confirmed_at).
  const deposits = await prisma.deposit.findMany({
    where: { status: 'confirmed', deletedAt: null },
    select: { walletAddress: true },
    orderBy: { confirmedAt: 'asc' },
  });

  const seen = new Set<string>();
  const first50: string[] = [];
  for (const { walletAddress: wallet } of deposits) {
    if (!seen.has(wallet)) {
      seen.add(wallet);
      first50.push(wallet);
      if (first50.length >= GENESIS_SAVER_CAP) break;
    }
  }
  return first50.includes(walletAddress);
}

/**
 * D2 — Mainnet Pioneer: wallet made a confirmed deposit within the first
 * MAINNET_PIONEER_WINDOW_DAYS days of launch. The app is single-network
 * (Stellar mainnet) now, so every confirmed deposit qualifies network-wise.
 * No cap — all qualifying wallets receive the badge.
 */
export async function checkMainnetPioneerEligibility(walletAddress: string): Promise<boolean> {
  const launchMs = getMainnetLaunchTimestampMs();
  if (launchMs === null) return false; // mainnet not launched yet

  const windowEndMs = launchMs + MAINNET_PIONEER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const data = await prisma.deposit.findFirst({
    where: {
      walletAddress,
      status: 'confirmed',
      confirmedAt: { gte: new Date(launchMs), lt: new Date(windowEndMs) },
      deletedAt: null,
    },
    select: { id: true },
  });

  return data !== null;
}

// ---------------------------------------------------------------------------
// Claim storage
// ---------------------------------------------------------------------------

export async function getActiveBadgeClaim(
  walletAddress: string,
  badgeType: string,
  cycleId: number,
): Promise<BadgeClaimRecord | null> {
  const claim = await prisma.badgeClaim.findFirst({
    where: { walletAddress, badgeType, cycleId, supersededAt: null, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return claim ? toBadgeClaimRecord(claim) : null;
}

export async function storeBadgeClaim(claim: {
  walletAddress: string;
  badgeType: string;
  cycleId: number;
  expiry: number;
  signature: string;
}): Promise<BadgeClaimRecord> {
  const created = await prisma.badgeClaim.create({
    data: {
      walletAddress: claim.walletAddress,
      badgeType: claim.badgeType,
      cycleId: claim.cycleId,
      expiresAt: new Date(claim.expiry * 1000),
      signature: claim.signature,
    },
  });
  return toBadgeClaimRecord(created);
}

/** Returns any claim (including superseded) for (wallet, badge_type, cycle_id). Used by the re-sign endpoint to confirm prior issuance. */
export async function getAnyClaim(
  walletAddress: string,
  badgeType: string,
  cycleId: number,
): Promise<BadgeClaimRecord | null> {
  const claim = await prisma.badgeClaim.findFirst({
    where: { walletAddress, badgeType, cycleId },
    orderBy: { createdAt: 'desc' },
  });
  return claim ? toBadgeClaimRecord(claim) : null;
}

export async function supersedeBadgeClaim(claimId: string): Promise<void> {
  await prisma.badgeClaim.update({
    where: { id: claimId },
    data: { supersededAt: new Date() },
  });
}

/** Convert a stored BadgeClaimRecord to the API response payload. */
export function toClaimPayload(record: BadgeClaimRecord, contractSymbol: string): BadgeClaimPayload {
  return {
    badge_type: record.badge_type,
    cycle_id: record.cycle_id,
    expiry: Math.floor(new Date(record.expiry).getTime() / 1000),
    signature: record.signature,
    contract_symbol: contractSymbol,
  };
}

/** Mark the active claim as confirmed with the on-chain transaction hash. */
export async function confirmBadgeClaim(
  walletAddress: string,
  badgeType: string,
  cycleId: number,
  transactionHash: string,
): Promise<void> {
  await prisma.badgeClaim.updateMany({
    where: { walletAddress, badgeType, cycleId, supersededAt: null },
    data: { confirmedAt: new Date(), transactionHash },
  });
}

export interface MintedBadge {
  badge_type: string;
  confirmed_at: string;
  transaction_hash: string;
}

/** Returns all on-chain confirmed badge mints for a wallet. */
export async function getMintedBadges(walletAddress: string): Promise<MintedBadge[]> {
  const rows = await prisma.badgeClaim.findMany({
    where: { walletAddress, confirmedAt: { not: null } },
    select: { badgeType: true, confirmedAt: true, transactionHash: true },
  });
  return rows.map((r) => ({
    badge_type: r.badgeType,
    confirmed_at: r.confirmedAt ? r.confirmedAt.toISOString() : '',
    transaction_hash: r.transactionHash ?? '',
  }));
}
