use soroban_sdk::{contracttype, Address, String};

#[derive(Clone)]
#[contracttype]
pub struct Position {
    pub owner: Address,
    pub amount: i128,
    pub shares: i128,
    pub finalization_time: u64,
    pub lock_period: u64,
}

#[derive(Clone)]
#[contracttype]
pub struct Period {
    pub reward_pool: i128,
    pub total_deposits: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    BlendToken,
    DeFindexVaultAddress,
    BasisPoints,
    EarlyWithdrawalFee,
    ProtocolFees,
    // NOTE: Positions(String) has moved to persistent storage (see positions module).
    // The variant is kept here so DataKey can still be used as a persistent key.
    Positions(String),
    Periods(u64),
    SupportedLockPeriod(u64),
    /// Running count of open positions across all periods.
    PositionCount,
    /// Running count of open positions for a specific lock period.
    PositionCountForPeriod(u64),
    /// Lifecycle flags written by __constructor and read by future slices.
    Paused,
    Version,
    UpgradesLocked,
    UpgradeTimelockSecs,
    /// Upgrade timelock state (written by upgrade module in slice 025).
    PendingUpgradeHash,
    UpgradeReadyAt,
    /// Running total of all open position amounts (for conservation invariant).
    TotalPrincipal,
    /// Running total of reward_pool across all periods (for conservation invariant).
    TotalRewardPool,
}
