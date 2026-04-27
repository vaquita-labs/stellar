import { PoolV2, Reserve } from '@blend-capital/blend-sdk';
import { xdr } from '@stellar/stellar-sdk';
import { ONE_DAY, ONE_HOUR } from '../../config/constants';
import { isStringJson } from '../../helpers';
import type { Deposit, Network, TokenNetwork } from '../../types';
import { getPeriodData } from './stellar-sdk';

const EMPTY = { blendInterest: 0, vaquitaInterest: 0 };

let lastRequest: { [key: string]: { timestamp: number, blendInterest: number, vaquitaInterest: number } } = {};
let lastResponse: { [key: string]: { timestamp: number, reserve: Reserve } } = {};

export const getBlendPoolReserve = async (networkData: Network) => {
  if (networkData.name !== 'Stellar Testnet') return null;
  
  const cacheKey = networkData.name;
  
  // Check cache first
  if (lastResponse[cacheKey] && Date.now() - lastResponse[cacheKey].timestamp <= ONE_HOUR) {
    // return lastResponse[cacheKey].reserve;
  }
  
  const poolId = 'CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65';
  const asssetId = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';
  const network = {
    passphrase: 'Test SDF Network ; September 2015',
    rpc: 'https://soroban-testnet.stellar.org',
  };
  const pool = await PoolV2.load(network, poolId);
  const reserve = pool.reserves.get(asssetId)!;
  
  // Cache the response
  lastResponse[cacheKey] = {
    timestamp: Date.now(),
    reserve,
  };
  
  return reserve;
};

export const getBlendInterest = async (deposit: Deposit, tokenNetworkData: TokenNetwork, reserve: Reserve) => {
  try {
    if (!isStringJson(deposit.transaction_event_raw)) {
      return EMPTY;
    }
    
    const vaquitaContractId = tokenNetworkData.vaquita_contract_address;
    const transaction = JSON.parse(deposit.transaction_event_raw);
    const contractEvent = transaction?.final?.events?.contractEventsXdr?.at(-1)?.at(-1);
    if (typeof contractEvent !== 'string') {
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
    
    const parsedContractEvent = xdr.ContractEvent.fromXDR(contractEvent, 'base64');
    const vec = parsedContractEvent.body().v0().data().vec();
    const i128 = vec?.[vec.length - 1]?.i128();
    let bRate = 0n;
    if (i128) {
      const hi = i128.hi().toBigInt();
      const lo = i128.lo().toBigInt();
      bRate = hi * (2n ** 64n) + lo;
    }
    
    const base = 10 ** tokenNetworkData.token_decimals;
    const currentBRate = BigInt((reserve?.data.bRate ?? 0n));
    const bTokens: number = bRate === 0n ? 0 : (deposit.amount * base / Number(bRate));
    const blendInterest = ((Number(currentBRate) - Number(bRate)) * bTokens) / base;
    const periodData = await getPeriodData(deposit.lock_period ?? ONE_DAY * 7, vaquitaContractId);
    const vaquitaInterest = periodData.totalDeposits > 0 ? (deposit.amount * Number(periodData.rewardPool) / Number(periodData.totalDeposits)) : 0;
    console.info({
      bRate,
      depositAmount: deposit.amount,
      currentBRate,
      bTokens,
      blendInterest,
      vaquitaInterest,
      periodData,
    });
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
