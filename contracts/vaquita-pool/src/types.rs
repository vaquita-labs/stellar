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
    Positions(String),
    Periods(u64),
    SupportedLockPeriod(u64),
}
