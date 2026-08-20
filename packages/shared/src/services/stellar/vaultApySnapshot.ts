import { prisma } from '@vaquita/db';
import type { DefindexHttpNetwork } from './defindexApy';

/**
 * How old a persisted rate may be before it is refused.
 *
 * The point of the snapshot is to bridge a DeFindex outage, not to keep a dead
 * rate on screen indefinitely: past this age, showing nothing is more honest
 * than showing a number that stopped being true a long time ago.
 */
export const VAULT_APY_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Persist a freshly read vault APY as the last known good value.
 *
 * Never throws and never rejects: this is best-effort cache maintenance on the
 * side of a request path, and a write failure must not turn a successful APY
 * read into a failed one. Callers may fire it without awaiting.
 */
export async function writeVaultApySnapshot(
  network: DefindexHttpNetwork,
  vaultAddress: string,
  apy: number,
): Promise<void> {
  try {
    const fetchedAt = new Date();
    await prisma.vaultApySnapshot.upsert({
      where: { network_vaultAddress: { network, vaultAddress } },
      create: { network, vaultAddress, apy, fetchedAt },
      update: { apy, fetchedAt },
    });
  } catch (error) {
    console.warn('[vaultApySnapshot] write failed', error);
  }
}

/**
 * Read the last known good vault APY, or `null` when there is none, it is
 * older than `maxAgeMs`, or the read itself fails.
 */
export async function readVaultApySnapshot(
  network: DefindexHttpNetwork,
  vaultAddress: string,
  maxAgeMs: number = VAULT_APY_SNAPSHOT_MAX_AGE_MS,
): Promise<number | null> {
  try {
    const row = await prisma.vaultApySnapshot.findUnique({
      where: { network_vaultAddress: { network, vaultAddress } },
      select: { apy: true, fetchedAt: true },
    });
    if (!row) return null;
    if (Date.now() - row.fetchedAt.getTime() > maxAgeMs) return null;
    return row.apy;
  } catch (error) {
    console.warn('[vaultApySnapshot] read failed', error);
    return null;
  }
}
