import { prisma } from '@vaquita/db';
import type { Config as PrismaConfig, Token as PrismaToken } from '@vaquita/db';
import type { Network, Token, TokenNetwork } from '../../types';

/**
 * Legacy network id. The `networks` table was dropped in the single-network
 * refactor (network data now lives in the singleton `config` row), but the
 * legacy `Deposit.network_id` field and the DTO layer still expect a numeric
 * id. We stamp the config row id here and ignore network filtering everywhere.
 */
export const SINGLE_NETWORK_ID = 1;

type ServiceResult<T> = { data: T; error: Error | null };

/** Maps a Prisma `Token` row to the legacy `TokenNetwork` shape the DTO/stellar
 *  layers consume. Fields that used to live in `tokens_networks` are now on the
 *  token directly. */
export const toTokenNetworkShape = (token: PrismaToken): TokenNetwork => ({
  is_native: token.isNative,
  is_gas: token.isGas,
  is_supported: token.isSupported,
  tokens: toTokenShape(token),
  contract_address: token.contractAddress ?? '',
  vaquita_contract_address: token.vaquitaContractAddress ?? '',
  ...(token.defindexVaultContractAddress
    ? { defindex_vault_contract_address: token.defindexVaultContractAddress }
    : {}),
  token_decimals: token.decimals ?? 7,
  // Legacy DTO contract: a comma-joined string of lock periods (ms).
  lock_period: token.lockPeriods.map(String).join(','),
});

export const toTokenShape = (token: PrismaToken): Token => ({
  id: token.id,
  name: token.name,
  symbol: token.symbol,
  decimals: token.decimals ?? 0,
});

/** Builds the legacy `Network` shape from the singleton config + its tokens. */
const toNetworkShape = (config: PrismaConfig, tokens: PrismaToken[]): Network => ({
  id: config.id,
  name: config.networkName,
  layer: '',
  type: '',
  chain_id: 0,
  smart_contract_env: '',
  languages: '',
  tokens_networks: tokens.map(toTokenNetworkShape),
  origins: (config.origins ?? []).join(','),
  order: 0,
  ...(config.badgesContractAddress ? { badges_contract_address: config.badgesContractAddress } : {}),
});

/** Loads the single project network (config singleton + supported tokens). */
const loadNetwork = async (): Promise<Network | null> => {
  const config = await prisma.config.findFirst();
  if (!config) return null;
  const tokens = await prisma.token.findMany({ where: { deletedAt: null } });
  return toNetworkShape(config, tokens);
};

export const getNetworkById = async (_id: number): Promise<ServiceResult<Network | null>> => {
  try {
    return { data: await loadNetwork(), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getNetworkByName = async (networkName: string): Promise<ServiceResult<Network | null>> => {
  try {
    const data = await loadNetwork();
    // Single-network: only the configured network exists; anything else is "not found".
    if (!data || data.name !== networkName) return { data: null, error: null };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getTokenBySymbol = async (tokenSymbol: string): Promise<ServiceResult<Token | null>> => {
  try {
    const token = await prisma.token.findFirst({ where: { symbol: tokenSymbol, deletedAt: null } });
    return { data: token ? toTokenShape(token) : null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getTokenNetworkByNetworkIdTokenId = async (
  _networkId: number,
  tokenId: number,
): Promise<ServiceResult<TokenNetwork | null>> => {
  try {
    const token = await prisma.token.findFirst({ where: { id: tokenId, deletedAt: null } });
    return { data: token ? toTokenNetworkShape(token) : null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

export const getTokenNetworkByContractAddressAndNetworkId = async (
  contractAddress: string,
  _networkId: number,
): Promise<ServiceResult<TokenNetwork | null>> => {
  try {
    const token = await prisma.token.findFirst({ where: { contractAddress, deletedAt: null } });
    return { data: token ? toTokenNetworkShape(token) : null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};
