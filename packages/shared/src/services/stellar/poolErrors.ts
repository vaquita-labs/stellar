/**
 * VaquitaPoolError — mirrors the Rust contract enum (error.rs).
 * Numeric codes are stable and must not change after mainnet deployment.
 */
export const VaquitaPoolErrorCode = {
  NotInitialized: 1,
  InvalidAmount: 2,
  DepositAlreadyExists: 3,
  InvalidPeriod: 4,
  PositionNotFound: 5,
  NotOwner: 6,
  InvalidFee: 7,
  FeeCapExceeded: 8,
  LockPeriodAlreadySupported: 9,
  LockPeriodNotSupported: 10,
  LockPeriodHasPositions: 11,
  VaultShareBalanceDecreased: 12,
  VaultReturnedZeroShares: 13,
  VaultReturnedLessThanPrincipal: 14,
  PeriodDataNotFound: 15,
  PeriodHasNoDeposits: 16,
  Paused: 17,
  ConservationInvariantViolated: 18,
  ArithmeticOverflow: 19,
  UpgradeNotProposed: 20,
  UpgradeNotReady: 21,
  UpgradeLocked: 22,
  VaultRepointHasOutstandingPositions: 23,
  TokenRepointHasOutstandingPositions: 24,
} as const;

export type VaquitaPoolErrorCodeValue =
  (typeof VaquitaPoolErrorCode)[keyof typeof VaquitaPoolErrorCode];

type ErrorMeta = { message: string; httpStatus: number };

const ERROR_META: Record<number, ErrorMeta> = {
  [VaquitaPoolErrorCode.NotInitialized]: { message: 'Contract not initialized', httpStatus: 503 },
  [VaquitaPoolErrorCode.InvalidAmount]: { message: 'Invalid deposit amount', httpStatus: 400 },
  [VaquitaPoolErrorCode.DepositAlreadyExists]: { message: 'Deposit ID already exists', httpStatus: 409 },
  [VaquitaPoolErrorCode.InvalidPeriod]: { message: 'Lock period not supported', httpStatus: 400 },
  [VaquitaPoolErrorCode.PositionNotFound]: { message: 'Position not found', httpStatus: 404 },
  [VaquitaPoolErrorCode.NotOwner]: { message: 'Caller is not the position owner', httpStatus: 403 },
  [VaquitaPoolErrorCode.InvalidFee]: { message: 'Invalid fee value', httpStatus: 400 },
  [VaquitaPoolErrorCode.FeeCapExceeded]: { message: 'Fee exceeds the 20% cap', httpStatus: 400 },
  [VaquitaPoolErrorCode.LockPeriodAlreadySupported]: { message: 'Lock period already registered', httpStatus: 409 },
  [VaquitaPoolErrorCode.LockPeriodNotSupported]: { message: 'Lock period not supported', httpStatus: 400 },
  [VaquitaPoolErrorCode.LockPeriodHasPositions]: { message: 'Lock period has open positions', httpStatus: 409 },
  [VaquitaPoolErrorCode.VaultShareBalanceDecreased]: { message: 'Vault share balance decreased unexpectedly', httpStatus: 502 },
  [VaquitaPoolErrorCode.VaultReturnedZeroShares]: { message: 'Vault returned zero shares', httpStatus: 502 },
  [VaquitaPoolErrorCode.VaultReturnedLessThanPrincipal]: { message: 'Vault returned less than principal', httpStatus: 502 },
  [VaquitaPoolErrorCode.PeriodDataNotFound]: { message: 'Period data not found', httpStatus: 404 },
  [VaquitaPoolErrorCode.PeriodHasNoDeposits]: { message: 'No deposits in this period', httpStatus: 400 },
  [VaquitaPoolErrorCode.Paused]: { message: 'Deposits are currently paused', httpStatus: 503 },
  [VaquitaPoolErrorCode.ConservationInvariantViolated]: { message: 'Conservation invariant violated', httpStatus: 502 },
  [VaquitaPoolErrorCode.ArithmeticOverflow]: { message: 'Arithmetic overflow', httpStatus: 500 },
  [VaquitaPoolErrorCode.UpgradeNotProposed]: { message: 'No upgrade is pending', httpStatus: 400 },
  [VaquitaPoolErrorCode.UpgradeNotReady]: { message: 'Upgrade timelock has not elapsed', httpStatus: 400 },
  [VaquitaPoolErrorCode.UpgradeLocked]: { message: 'Upgrades have been locked forever', httpStatus: 400 },
  [VaquitaPoolErrorCode.VaultRepointHasOutstandingPositions]: { message: 'Cannot change vault while positions are open', httpStatus: 409 },
  [VaquitaPoolErrorCode.TokenRepointHasOutstandingPositions]: { message: 'Cannot change token while positions are open', httpStatus: 409 },
};

const FALLBACK: ErrorMeta = { message: 'Contract error', httpStatus: 500 };

/**
 * Return the human-readable message and HTTP status for a VaquitaPoolError code.
 */
export function getPoolErrorMeta(code: number): ErrorMeta {
  return ERROR_META[code] ?? FALLBACK;
}

/**
 * Parse a Soroban simulation or invocation error message and extract the
 * VaquitaPoolError code if present. Soroban errors are reported as
 * `"Error(Contract, #N)"` where N is the error code.
 *
 * Returns `null` if the string does not match the expected pattern.
 */
export function parsePoolErrorCode(errorMessage: string): number | null {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(errorMessage);
  if (!match || !match[1]) return null;
  const code = parseInt(match[1], 10);
  return code in ERROR_META ? code : null;
}

/**
 * Try to extract a VaquitaPoolError from an arbitrary thrown value and return
 * `{ code, message, httpStatus }`. Returns `null` if the error is not a
 * recognisable VaquitaPoolError.
 */
export function tryParsePoolError(
  err: unknown,
): { code: number; message: string; httpStatus: number } | null {
  const str =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err ?? '');
  const code = parsePoolErrorCode(str);
  if (code === null) return null;
  const meta = getPoolErrorMeta(code);
  return { code, ...meta };
}
