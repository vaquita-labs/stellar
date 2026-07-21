import type { Config, Token } from '@vaquita/db';
import { firstElement } from '../../helpers';
import type {
  ProjectConfigCurrencyDTO,
  ProjectConfigLanguageDTO,
  ProjectConfigResponseDTO,
} from '../../types';

/**
 * Coerces a `{ id, label, hint? }[]` Json column into a typed option list,
 * tolerating a null/non-array column or malformed entries (those are dropped).
 * Shared by the currencies and languages columns (same shape).
 */
const toOptionList = <T extends { id: string; label: string; hint?: string }>(
  value: unknown,
): T[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, label, hint } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string') return [];
    return [{ id, label, ...(typeof hint === 'string' ? { hint } : {}) } as T];
  });
};

const toCurrencies = (value: unknown): ProjectConfigCurrencyDTO[] =>
  toOptionList<ProjectConfigCurrencyDTO>(value);

const toLanguages = (value: unknown): ProjectConfigLanguageDTO[] =>
  toOptionList<ProjectConfigLanguageDTO>(value);

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
    // lock_periods is a bigint[] column; the DTO contract is number[] (ms).
    lockPeriods: token.lockPeriods.map(Number),
    contractAddress: token.contractAddress?.split(',')?.[0] ?? '',
    vaquitaContractAddress: firstElement(token.vaquitaContractAddress ?? ''),
  })),
  currencies: toCurrencies(config.currencies),
  languages: toLanguages(config.languages),
});
