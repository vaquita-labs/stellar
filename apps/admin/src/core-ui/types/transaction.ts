export type DepositFn = (
  id: number,
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
  id: number,
  depositIdHex: string,
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
  id: number,
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
  id: number,
  depositIdHex: string,
  vaquitaContractAddress: string
) => Promise<{
  success: boolean;
  txHash: string;
  explorer: string;
  error: null | Error | unknown;
  transaction: object | null;
}>;
