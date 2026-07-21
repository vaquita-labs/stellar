import { ONE_DAY, ONE_HOUR } from '../../config/constants';
import { firstElement } from '../../helpers';
import type { Deposit, TokenNetwork } from '../../types';
import { getStellarDepositContractAddress } from './events';
import { getAssetAmountsPerShares } from './defindexVault';
import { getPeriodData, getVaquitaPoolPosition } from './stellar-sdk';

const EMPTY = { blendInterest: 0, vaquitaInterest: 0 };

let lastRequest: { [key: string]: { timestamp: number; blendInterest: number; vaquitaInterest: number } } = {};

function stroopsToAmount(stroops: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  return Number(stroops) / Number(base);
}

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

    const vaultContractId = tokenNetworkData.defindex_vault_contract_address;
    if (!vaultContractId) {
      throw new Error('[getBlendInterest] defindex_vault_contract_address is not set for this token/network row');
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
