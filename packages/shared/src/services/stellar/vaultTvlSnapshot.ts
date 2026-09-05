import { prisma } from '@vaquita/db';
import { cached, firstElement } from '../../helpers';
import type { Network, TokenNetwork } from '../../types';
import { stellarNetworkNameToDefindexHttpNetwork } from './defindexApy';
import { getVaultTotalManagedFunds } from './defindexVault';

/**
 * How often the vault is sampled, per vault, across all callers.
 *
 * TVL moves on deposits and withdrawals, both of which are rare relative to
 * page loads, so a tighter interval would buy resolution nobody can see while
 * putting a Soroban simulation on a hot request path. Ten minutes also matches
 * the vault-APY cache this rides along with, so a single warm window serves both.
 */
const VAULT_TVL_SAMPLE_TTL_MS = 10 * 60 * 1000;

/**
 * Append one sample of the vault's total managed funds.
 *
 * Never throws and never rejects: this is observability written on the side of
 * a user request, and a failed insert must not turn a working APY read into an
 * error. Callers fire it without awaiting.
 */
export async function writeVaultTvlSnapshot(
  network: string,
  vaultAddress: string,
  totalManaged: number,
): Promise<void> {
  try {
    await prisma.vaultTvlSnapshot.create({
      data: { network, vaultAddress, totalManaged, fetchedAt: new Date() },
    });
  } catch (error) {
    console.warn('[vaultTvlSnapshot] write failed', error);
  }
}

/**
 * Read the vault's total managed funds and record a sample, at most once per
 * `VAULT_TVL_SAMPLE_TTL_MS` per vault.
 *
 * Returns the amount in human units, or `null` when the vault is unset, the
 * network is not Stellar, or the on-chain read failed — `null` means "unknown",
 * never "zero", so no caller can plot an outage as an emptied vault.
 */
export async function sampleVaultTvl(network: Network, tokenNetworkData: TokenNetwork): Promise<number | null> {
  const defindexNet = stellarNetworkNameToDefindexHttpNetwork(network.name);
  const vaultAddress = firstElement(tokenNetworkData.defindex_vault_contract_address ?? '')?.trim() || '';
  if (!vaultAddress || !defindexNet) return null;

  return cached<number | null>(
    `defindex:tvl:${defindexNet}:${vaultAddress}`,
    async () => {
      const raw = await getVaultTotalManagedFunds(vaultAddress);
      if (raw == null) return null;
      const decimals = tokenNetworkData.token_decimals ?? 7;
      const totalManaged = Number(raw) / 10 ** decimals;
      void writeVaultTvlSnapshot(defindexNet, vaultAddress, totalManaged);
      return totalManaged;
    },
    { ttlMs: VAULT_TVL_SAMPLE_TTL_MS },
  );
}
