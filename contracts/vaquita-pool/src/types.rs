use soroban_sdk::{contracttype, Address, BytesN};

#[derive(Clone)]
#[contracttype]
pub struct Position {
    pub owner: Address,
    /// BLEND token this position was opened with, captured at deposit time so
    /// withdrawal always settles in the correct asset even if the pool's global
    /// token is later repointed (security finding 038e5c7a).
    pub token: Address,
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
    // Positions live in persistent storage (see positions module). The key is a
    // contract-derived id = sha256(caller || nonce), so a position id is bound to
    // its depositor and cannot be squatted by a third party (finding 1e484c83).
    Positions(BytesN<32>),
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
