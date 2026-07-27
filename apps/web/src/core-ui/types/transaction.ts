export type DepositFn = (
  nonce: bigint | string,
  amount: number,
  lockPeriod: number,
  log: (message: string, data?: object) => void
) => Promise<{
  success: boolean;
  depositIdHex: string;
  txHash: string;
  explorer: string;
  error: null | Error | unknown;
  transaction: object | null;
}>;

export type WithdrawFn = (
  nonce: bigint | string,
  vaquitaContractAddress: string,
  log: (message: string, data?: object) => void
) => Promise<{
  success: boolean;
  txHash: string;
  explorer: string;
  error: null | Error | unknown;
  transaction: object | null;
}>;

export type DepositFunction = (
  nonce: bigint | string,
  amount: number,
  lockPeriod: number
) => Promise<{
  success: boolean;
  depositIdHex: string;
  txHash: string;
  explorer: string;
  error: null | Error | unknown;
  transaction: object | null;
}>;

export type WithdrawFunction = (
  nonce: bigint | string,
  vaquitaContractAddress: string
) => Promise<{
  success: boolean;
  txHash: string;
  explorer: string;
  error: null | Error | unknown;
  transaction: object | null;
}>;
