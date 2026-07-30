import type { Config, Token } from '@vaquita/db';
import { firstElement } from '../../helpers';
import type {
  ProjectConfigCurrencyDTO,
  ProjectConfigLanguageDTO,
  ProjectConfigResponseDTO,
} from '../../types';
import { isTokenUsable } from './readiness';

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
 *
 * Only tokens the app can serve end to end are published (see `tokenReadiness`).
 * A half-configured token does not fail loudly downstream — it reads a balance of
 * 0, never detects incoming funds, or shows a 0% APY — so it is better never
 * offered. The admin lists every token along with what each one is missing.
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
  tokens: tokens.filter(isTokenUsable).map((token) => ({
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
    issuer: token.issuer ?? null,
    blendPoolContractAddress: token.blendPoolContractAddress ?? null,
    defindexVaultContractAddress: token.defindexVaultContractAddress ?? null,
  })),
  currencies: toCurrencies(config.currencies),
  languages: toLanguages(config.languages),
});
