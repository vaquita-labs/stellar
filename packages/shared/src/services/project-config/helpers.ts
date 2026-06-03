import type { Config, Token } from '@vaquita/db';
import { firstElement } from '../../helpers';
import type { ProjectConfigCurrencyDTO, ProjectConfigResponseDTO } from '../../types';

/**
 * Coerces the `config.currencies` Json column into a typed currency list,
 * tolerating a null/non-array column or malformed entries (those are dropped).
 */
const toCurrencies = (value: unknown): ProjectConfigCurrencyDTO[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, label, hint } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string') return [];
    return [{ id, label, ...(typeof hint === 'string' ? { hint } : {}) }];
  });
};

/**
 * Maps the singleton ProjectConfig + its tokens (Prisma rows) to the public DTO.
 * Token fields that used to live in `tokens_networks` are now on `tokens` directly.
 */
export const toProjectConfig = (
  config: Config,
  tokens: Token[],
): ProjectConfigResponseDTO => ({
  networkName: config.networkName,
  networkPassphrase: config.networkPassphrase ?? null,
  ...(config.badgesContractAddress
    ? { badgesContractAddress: config.badgesContractAddress }
    : {}),
  tokens: tokens.map((token) => ({
    isGas: token.isGas,
    isNative: token.isNative,
    isSupported: token.isSupported,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals ?? 0,
    lockPeriods: token.lockPeriods,
    contractAddress: token.contractAddress?.split(',')?.[0] ?? '',
    vaquitaContractAddress: firstElement(token.vaquitaContractAddress ?? ''),
  })),
  currencies: toCurrencies(config.currencies),
});
