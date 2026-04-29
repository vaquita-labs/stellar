import { PoolV2, Reserve } from '@blend-capital/blend-sdk';
import { ONE_DAY, ONE_HOUR } from '../../config/constants';
import { firstElement } from '../../helpers';
import type { Deposit, Network, TokenNetwork } from '../../types';
import { getStellarDepositContractAddress } from './events';
import { getAssetAmountsPerShares } from './defindexVault';
import { getPeriodData, getVaquitaPoolPosition } from './stellar-sdk';

const EMPTY = { blendInterest: 0, vaquitaInterest: 0 };

let lastRequest: { [key: string]: { timestamp: number; blendInterest: number; vaquitaInterest: number } } = {};
let lastResponse: { [key: string]: { timestamp: number; reserve: Reserve } } = {};

function stroopsToAmount(stroops: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  return Number(stroops) / Number(base);
}

export const getBlendPoolReserve = async (networkData: Network) => {
  if (networkData.name !== 'Stellar Testnet') {
    return null;
  }

  const cacheKey = networkData.name;
  if (lastResponse[cacheKey] && Date.now() - lastResponse[cacheKey].timestamp <= ONE_HOUR) {
    // return lastResponse[cacheKey].reserve;
  }

  const poolId = 'CDDDPAJOHXE4I5375IT72KXX5EAHGB6V45YKLEIATTTWIGIBUGPEQYJP';
  const asssetId = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';
  const network = {
    passphrase: 'Test SDF Network ; September 2015',
    rpc: 'https://soroban-testnet.stellar.org',
  };

  try {
    const pool = await PoolV2.load(network, poolId);
    const reserve = pool.reserves.get(asssetId)!;

    lastResponse[cacheKey] = {
      timestamp: Date.now(),
      reserve,
    };

    return reserve;
  } catch (error) {
    console.log('getBlendPoolReserve', error);
    return null;
  }
};

/**
 * Per-deposit Stellar yield:
 * - `blendInterest` (API name kept for compatibility): vault accrual = gross underlying − principal via DeFindex
 *   `get_asset_amounts_per_shares(shares)` (vault id from env or `defindex_vault_contract_address`).
 * - `vaquitaInterest`: proportional `reward_pool` share for the lock period (on-chain snapshot).
 */
export const getBlendInterest = async (deposit: Deposit, tokenNetworkData: TokenNetwork) => {
  try {
    if (!deposit.deposit_id_hex) {
      return EMPTY;
    }

    const poolContractId =
      getStellarDepositContractAddress(deposit) || firstElement(tokenNetworkData.vaquita_contract_address);
    if (!poolContractId) {
      return EMPTY;
    }

    if (!lastRequest[deposit.deposit_id_hex]) {
      lastRequest[deposit.deposit_id_hex] = {
        timestamp: 0,
        blendInterest: 0,
        vaquitaInterest: 0,
      };
    }
    if (Date.now() - lastRequest[deposit.deposit_id_hex]!.timestamp <= ONE_HOUR) {
      return {
        blendInterest: lastRequest[deposit.deposit_id_hex]!.blendInterest,
        vaquitaInterest: lastRequest[deposit.deposit_id_hex]!.vaquitaInterest,
      };
    }

    const position = await getVaquitaPoolPosition(poolContractId, deposit.deposit_id_hex);
    if (!position) {
      return EMPTY;
    }

    const vaultContractId =
      firstElement(tokenNetworkData.defindex_vault_contract_address ?? '') ||
      process.env.STELLAR_DEFINDEX_VAULT_CONTRACT ||
      '';
    if (!vaultContractId) {
      console.warn(
        '[getBlendInterest] Missing DeFindex vault id: set STELLAR_DEFINDEX_VAULT_CONTRACT or tokens_networks.defindex_vault_contract_address',
      );
      return EMPTY;
    }
    const amounts = await getAssetAmountsPerShares(vaultContractId, position.shares);
    if (!amounts || amounts.length === 0) {
      return EMPTY;
    }
    const assets0 = amounts[0] ?? 0n;

    const principal = position.amount;
    const accrualStroops = assets0 > principal ? assets0 - principal : 0n;

    const decimals = tokenNetworkData.token_decimals ?? 7;
    const blendInterest = stroopsToAmount(accrualStroops, decimals);

    const lockPeriodMs =
      position.lockPeriodSec > 0n
        ? Number(position.lockPeriodSec) * 1000
        : deposit.lock_period ?? ONE_DAY * 7;
    const periodData = await getPeriodData(lockPeriodMs, poolContractId);
    const rp = BigInt(periodData.rewardPool);
    const td = BigInt(periodData.totalDeposits);
    let vaquitaInterest = 0;
    if (td > 0n) {
      const rewardStroops = (rp * principal) / td;
      vaquitaInterest = stroopsToAmount(rewardStroops, decimals);
    }

    lastRequest[deposit.deposit_id_hex] = {
      timestamp: Date.now(),
      blendInterest,
      vaquitaInterest,
    };
    return { blendInterest, vaquitaInterest };
  } catch (error) {
    console.error('getBlendInterest', error);
    return EMPTY;
  }
};
