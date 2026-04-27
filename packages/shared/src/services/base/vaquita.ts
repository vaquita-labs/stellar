import { ethers, Wallet } from 'ethers';
import { VaquitaPoolMultiAsset } from '../../abi/VaquitaPoolMultiAsset';
import { firstElement } from '../../helpers';
import type { Network, TokenNetwork } from '../../types';

const baseSignerRef: { current: Wallet | null } = { current: null };

export const getBaseSigner = () => {
  if (baseSignerRef.current) {
    return baseSignerRef.current;
  }
  const provider = new ethers.JsonRpcProvider(process.env.BASE_MAINNET_RPC_URL);
  const privateKey = process.env.PRIVATE_KEY!;
  if (!privateKey || !ethers.isHexString(privateKey)) {
    throw new Error('Invalid or missing PRIVATE_KEY in environment variables.');
  }
  baseSignerRef.current = new ethers.Wallet(privateKey, provider);
  return baseSignerRef.current;
};

const baseSepoliaSignerRef: { current: Wallet | null } = { current: null };

export const getBaseSepoliaSigner = () => {
  if (baseSepoliaSignerRef.current) {
    return baseSepoliaSignerRef.current;
  }
  const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const privateKey = process.env.PRIVATE_KEY!;
  if (!privateKey || !ethers.isHexString(privateKey)) {
    throw new Error('Invalid or missing PRIVATE_KEY in environment variables.');
  }
  baseSepoliaSignerRef.current = new ethers.Wallet(privateKey, provider);
  return baseSepoliaSignerRef.current;
};

export const getBaseVaquitaContract = (vaquitaContractAddress: string) => {
  try {
    const signer = getBaseSigner();
    return new ethers.Contract(vaquitaContractAddress, VaquitaPoolMultiAsset, signer);
  } catch (error) {
    console.error('Error on getBaseVaquitaContract', error);
    return null;
  }
};

export const getBaseSepoliaVaquitaContract = (vaquitaContractAddress: string) => {
  try {
    const signer = getBaseSepoliaSigner();
    return new ethers.Contract(vaquitaContractAddress, VaquitaPoolMultiAsset, signer);
  } catch (error) {
    console.error('Error on getBaseSepoliaVaquitaContract', error);
    return null;
  }
};

export const getVaquitaPoolPeriods = async (lockPeriod: number, networkData: Network, tokenNetworkData: TokenNetwork) => {
  const empty = { rewardPool: 0, totalDeposits: 0, totalShares: 0 };
  try {
    const vaquitaPoolAddress = firstElement(tokenNetworkData!.vaquita_contract_address);
    
    const vaquitaPool = networkData.name === 'Base' ? getBaseVaquitaContract(vaquitaPoolAddress) : getBaseSepoliaVaquitaContract(vaquitaPoolAddress);
    if (!vaquitaPool) {
      console.error('No Vaquita Pool');
      return empty;
    }
    
    let period;
    if (networkData.name === 'Base') {
      period = await vaquitaPool.periods?.(lockPeriod / 1000, firstElement(tokenNetworkData.contract_address));
    } else {
      period = await vaquitaPool.periods?.(lockPeriod / 1000, firstElement(tokenNetworkData.contract_address));
    }
    const rewardPool = Number(period?.[0] ?? 0) / (10 ** tokenNetworkData.token_decimals);
    const totalDeposits = Number(period?.[1] ?? 0) / (10 ** tokenNetworkData.token_decimals);
    const totalShares = Number(period?.[2] ?? 0);
    
    return { rewardPool, totalDeposits, totalShares };
  } catch (error) {
    console.error('Error on getVaquitaPoolPeriods', error);
    return empty;
  }
};
