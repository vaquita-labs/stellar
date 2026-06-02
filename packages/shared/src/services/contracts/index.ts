import { prisma } from '@vaquita/db';
import type { Abi } from '../../types';

const cache: { [key: string]: Abi } = {};

export const getABIByAddress = async (address: string): Promise<Abi> => {
  if (!address) return [] as Abi;
  if (cache[address]) {
    return cache[address];
  }

  const contract = await prisma.contract.findFirst({
    where: { address, deletedAt: null },
  });

  if (contract?.abi) {
    cache[address] = contract.abi as Abi;
  }

  return (cache[address] || []) as Abi;
};

/**
 * @deprecated `contracts.network_id` was dropped in the single-network refactor.
 * Kept as a thin wrapper so existing callers compile; `networkId` is ignored.
 */
export const getABIByAddressByNetworkId = async (
  address: string,
  _networkId?: number,
): Promise<Abi> => getABIByAddress(address);
