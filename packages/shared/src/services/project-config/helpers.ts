import type { ProjectConfig, Token } from '@vaquita/db';
import { firstElement } from '../../helpers';
import type { ProjectConfigResponseDTO } from '../../types';
import { getABIByAddress } from '../contracts';

/**
 * Maps the singleton ProjectConfig + its tokens (Prisma rows) to the public DTO.
 * Token fields that used to live in `tokens_networks` are now on `tokens` directly.
 */
export const toProjectConfig = async (
  config: ProjectConfig,
  tokens: Token[],
): Promise<ProjectConfigResponseDTO> => ({
  networkName: config.networkName,
  networkPassphrase: config.networkPassphrase ?? null,
  ...(config.badgesContractAddress
    ? { badgesContractAddress: config.badgesContractAddress }
    : {}),
  tokens: await Promise.all(
    tokens.map(async (token) => ({
      isGas: token.isGas,
      isNative: token.isNative,
      isSupported: token.isSupported,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals ?? 0,
      lockPeriods: token.lockPeriods,
      contractAddress: token.contractAddress?.split(',')?.[0] ?? '',
      contractAbi: await getABIByAddress(token.contractAddress ?? ''),
      vaquitaContractAddress: firstElement(token.vaquitaContractAddress ?? ''),
      vaquitaContractAbi: await getABIByAddress(firstElement(token.vaquitaContractAddress ?? '')),
    })),
  ),
});
