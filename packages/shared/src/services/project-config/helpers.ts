import type { Config, Token } from '@vaquita/db';
import { firstElement } from '../../helpers';
import type {
  DepositPlatformDTO,
  ProjectConfigCurrencyDTO,
  ProjectConfigLanguageDTO,
  ProjectConfigResponseDTO,
} from '../../types';
import { isTokenUsable } from './readiness';
import { DEFAULT_LEGAL_POLICY_VERSION } from '../legal';

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

const HTTPS_RE = /^https:\/\//;

/**
 * Coerces `config.deposit_platforms` into the public catalog: enabled entries
 * only, sorted by `order`. A malformed entry is dropped rather than failing the
 * whole config read — the column is hand-edited JSON, and one typo must not take
 * the boot request down with it. Links that are not https are dropped too, since
 * they end up in an `href`.
 */
export const toDepositPlatforms = (value: unknown): DepositPlatformDTO[] => {
  if (!Array.isArray(value)) return [];
  const rows = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id || typeof e.name !== 'string') return [];
    if (e.tier !== 'direct' && e.tier !== 'bridge') return [];
    if (typeof e.network !== 'string' || typeof e.asset !== 'string') return [];
    if (e.enabled !== true) return [];
    const helpLinks = Array.isArray(e.helpLinks)
      ? e.helpLinks.flatMap((link) => {
          const l = (link ?? {}) as Record<string, unknown>;
          return typeof l.id === 'string' && typeof l.url === 'string' && HTTPS_RE.test(l.url)
            ? [{ id: l.id, url: l.url }]
            : [];
        })
      : [];
    const platform: DepositPlatformDTO = {
      id: e.id,
      name: e.name,
      tier: e.tier,
      network: e.network,
      asset: e.asset,
      fee: typeof e.fee === 'string' ? e.fee : null,
      minAmount: typeof e.minAmount === 'number' && e.minAmount > 0 ? e.minAmount : null,
      appUrl: typeof e.appUrl === 'string' && HTTPS_RE.test(e.appUrl) ? e.appUrl : null,
      helpLinks,
    };
    return [{ platform, order: typeof e.order === 'number' ? e.order : Number.MAX_SAFE_INTEGER }];
  });
  return rows.sort((a, b) => a.order - b.order).map(({ platform }) => platform);
};

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
  legalPolicyVersion: config.legalPolicyVersion || DEFAULT_LEGAL_POLICY_VERSION,
  depositPlatforms: toDepositPlatforms(config.depositPlatforms),
  bridgeEnabled: config.bridgeEnabled !== false,
});
