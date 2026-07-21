use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaquitaPoolError {
    NotInitialized = 1,
    InvalidAmount = 2,
    DepositAlreadyExists = 3,
    InvalidPeriod = 4,
    PositionNotFound = 5,
    NotOwner = 6,
    InvalidFee = 7,
    FeeCapExceeded = 8,
    LockPeriodAlreadySupported = 9,
    LockPeriodNotSupported = 10,
    LockPeriodHasPositions = 11,
    VaultShareBalanceDecreased = 12,
    VaultReturnedZeroShares = 13,
    VaultReturnedLessThanPrincipal = 14,
    PeriodDataNotFound = 15,
    PeriodHasNoDeposits = 16,
    Paused = 17,
    ConservationInvariantViolated = 18,
    ArithmeticOverflow = 19,
    UpgradeNotProposed = 20,
    UpgradeNotReady = 21,
    UpgradeLocked = 22,
    VaultRepointHasOutstandingPositions = 23,
    TokenRepointHasOutstandingPositions = 24,
}
