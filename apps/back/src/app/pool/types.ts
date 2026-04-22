import { EntityDocument } from 'types';

export enum DepositPoolStatus {
  ACTIVE = 'active',
  CONCLUDED = 'concluded',
  EARLY_CONCLUDED = 'early-concluded',
}

export enum GroupCrypto {
  USDC = 'USDC',
  SOL = 'SOL',
  WLD = 'WLD',
}

export interface PoolDepositBaseDocument {
  companyId: string,
  contractAddress: string,
  transactionHash: string,
  timestamp: number,
  amount: string,
  depositId: string,
  customerPublicKey: string,
  crypto: GroupCrypto,
  status: DepositPoolStatus,
  rewardWithdrawn: string,
  amountWithdrawn: string,
  event: object,
}

export type PoolDepositDocument = EntityDocument<PoolDepositBaseDocument>;
