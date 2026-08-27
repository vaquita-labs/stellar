import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCached } from '../../helpers';
import type { Network, TokenNetwork } from '../../types';
import { fetchDefindexVaultApy } from './defindexApy';
import { readVaultApySnapshot, writeVaultApySnapshot } from './vaultApySnapshot';
import { getVaultApy } from './apy';

vi.mock('./defindexApy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./defindexApy')>()),
  fetchDefindexVaultApy: vi.fn(),
}));

vi.mock('./vaultApySnapshot', () => ({
  VAULT_APY_SNAPSHOT_MAX_AGE_MS: 86_400_000,
  readVaultApySnapshot: vi.fn(),
  writeVaultApySnapshot: vi.fn().mockResolvedValue(undefined),
}));

const fetchApy = vi.mocked(fetchDefindexVaultApy);
const readSnapshot = vi.mocked(readVaultApySnapshot);
const writeSnapshot = vi.mocked(writeVaultApySnapshot);

const TTL = 10 * 60 * 1000;
const NEGATIVE_TTL = 30 * 1000;

const network = { name: 'Stellar Testnet' } as unknown as Network;
const token = { defindex_vault_contract_address: 'CVAULT' } as unknown as TokenNetwork;

beforeEach(() => {
  vi.clearAllMocks();
  clearCached();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  readSnapshot.mockResolvedValue(null);
  writeSnapshot.mockResolvedValue(undefined);
});

describe('getVaultApy', () => {
  it('returns the live rate and refreshes the snapshot', async () => {
    fetchApy.mockResolvedValue(5.25);

    await expect(getVaultApy(network, token)).resolves.toEqual({
      protocolApy: 5.25,
      lendingMarketName: 'DeFindex',
    });
    expect(writeSnapshot).toHaveBeenCalledWith('testnet', 'CVAULT', 5.25);
  });

  it('does not call DeFindex at all when no vault is configured', async () => {
    const noVault = { defindex_vault_contract_address: '' } as unknown as TokenNetwork;

    await expect(getVaultApy(network, noVault)).resolves.toEqual({
      protocolApy: 0,
      lendingMarketName: '',
    });
    expect(fetchApy).not.toHaveBeenCalled();
  });

  it('shares one upstream call across both callers within the TTL', async () => {
    fetchApy.mockResolvedValue(5.25);

    await Promise.all([getVaultApy(network, token), getVaultApy(network, token)]);
    vi.setSystemTime(TTL - 1);
    await getVaultApy(network, token);

    expect(fetchApy).toHaveBeenCalledTimes(1);
  });

  describe('cold process during a DeFindex outage', () => {
    it('serves the persisted rate instead of a real-looking 0%', async () => {
      fetchApy.mockResolvedValue(null);
      readSnapshot.mockResolvedValue(4.75);

      await expect(getVaultApy(network, token)).resolves.toEqual({
        protocolApy: 4.75,
        lendingMarketName: 'DeFindex',
      });
    });

    it('reports no rate when there is no usable snapshot either', async () => {
      fetchApy.mockResolvedValue(null);
      readSnapshot.mockResolvedValue(null);

      await expect(getVaultApy(network, token)).resolves.toEqual({
        protocolApy: 0,
        lendingMarketName: '',
      });
    });

    it('keeps retrying the upstream on the short TTL while serving the snapshot', async () => {
      fetchApy.mockResolvedValue(null);
      readSnapshot.mockResolvedValue(4.75);

      await getVaultApy(network, token);
      expect(fetchApy).toHaveBeenCalledTimes(1);

      // Held briefly, so the snapshot is not mistaken for a healthy value.
      vi.setSystemTime(NEGATIVE_TTL - 1);
      await getVaultApy(network, token);
      expect(fetchApy).toHaveBeenCalledTimes(1);

      vi.setSystemTime(NEGATIVE_TTL);
      fetchApy.mockResolvedValue(5.25);
      await expect(getVaultApy(network, token)).resolves.toEqual({
        protocolApy: 5.25,
        lendingMarketName: 'DeFindex',
      });
      expect(fetchApy).toHaveBeenCalledTimes(2);
    });

    it('never persists a snapshot back over itself', async () => {
      fetchApy.mockResolvedValue(null);
      readSnapshot.mockResolvedValue(4.75);

      await getVaultApy(network, token);

      expect(writeSnapshot).not.toHaveBeenCalled();
    });
  });

  it('prefers the in-memory last-good rate over an older snapshot', async () => {
    fetchApy.mockResolvedValueOnce(5.25).mockResolvedValue(null);
    readSnapshot.mockResolvedValue(4.75);

    await getVaultApy(network, token);
    vi.setSystemTime(TTL);

    await expect(getVaultApy(network, token)).resolves.toEqual({
      protocolApy: 5.25,
      lendingMarketName: 'DeFindex',
    });
  });
});
