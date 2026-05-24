use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, String, Symbol, Vec};

/// Topic symbols for each event type.
const DEPOSIT: Symbol = symbol_short!("deposit");
const WITHDRAW: Symbol = symbol_short!("withdraw");
const CONSTRUCTED: Symbol = symbol_short!("init");
const FEE_UPDATED: Symbol = symbol_short!("fee_upd");
const REWARDS: Symbol = symbol_short!("rewards");
const PAUSED: Symbol = symbol_short!("paused");
const UNPAUSED: Symbol = symbol_short!("unpaused");
const LP_REMOVED: Symbol = symbol_short!("lp_rm");
const VAULT_UPDATED: Symbol = symbol_short!("vault_upd");
const TOKEN_UPDATED: Symbol = symbol_short!("tok_upd");
const UPGRADE_PROPOSED: Symbol = symbol_short!("upg_prop");
const UPGRADE_CANCELLED: Symbol = symbol_short!("upg_canc");
const UPGRADE_EXECUTED: Symbol = symbol_short!("upg_exec");
const UPGRADES_LOCKED: Symbol = symbol_short!("upg_lock");

/// Typed payload for a deposit event.
/// Topic: ("deposit", caller)  Data: DepositEvent
#[contracttype]
pub struct DepositEvent {
    pub deposit_id: String,
    pub token: Address,
    pub amount: i128,
    pub shares: i128,
}

/// Typed payload for a withdraw event.
/// Topic: ("withdraw", caller)  Data: WithdrawEvent
#[contracttype]
pub struct WithdrawEvent {
    pub deposit_id: String,
    pub token: Address,
    pub amount: i128,
    pub reward: i128,
}

pub fn emit_deposit(
    env: &Env,
    caller: Address,
    deposit_id: String,
    token: Address,
    amount: i128,
    shares: i128,
) {
    env.events().publish(
        (DEPOSIT, caller),
        DepositEvent { deposit_id, token, amount, shares },
    );
}

/// Typed payload for the constructor event.
#[contracttype]
pub struct ConstructedEvent {
    pub blend_token: Address,
    pub defindex_vault: Address,
    pub lock_periods: Vec<u64>,
}

pub fn emit_constructed(
    env: &Env,
    admin: Address,
    blend_token: Address,
    defindex_vault: Address,
    lock_periods: Vec<u64>,
) {
    env.events().publish(
        (CONSTRUCTED, admin),
        ConstructedEvent { blend_token, defindex_vault, lock_periods },
    );
}

/// EarlyWithdrawalFeeUpdated event payload.
#[contracttype]
pub struct EarlyWithdrawalFeeUpdatedEvent {
    pub old_fee: i128,
    pub new_fee: i128,
}

pub fn emit_fee_updated(env: &Env, old_fee: i128, new_fee: i128) {
    env.events().publish(
        (FEE_UPDATED,),
        EarlyWithdrawalFeeUpdatedEvent { old_fee, new_fee },
    );
}

/// RewardsAdded event payload.
#[contracttype]
pub struct RewardsAddedEvent {
    pub period: u64,
    pub amount: i128,
}

pub fn emit_rewards_added(env: &Env, period: u64, amount: i128) {
    env.events().publish(
        (REWARDS,),
        RewardsAddedEvent { period, amount },
    );
}

pub fn emit_paused(env: &Env) {
    env.events().publish((PAUSED,), ());
}

pub fn emit_unpaused(env: &Env) {
    env.events().publish((UNPAUSED,), ());
}

/// LockPeriodRemoved event payload.
#[contracttype]
pub struct LockPeriodRemovedEvent {
    pub period: u64,
}

pub fn emit_lock_period_removed(env: &Env, period: u64) {
    env.events()
        .publish((LP_REMOVED,), LockPeriodRemovedEvent { period });
}

/// DeFindexVaultUpdated event payload.
#[contracttype]
pub struct DeFindexVaultUpdatedEvent {
    pub old_vault: Address,
    pub new_vault: Address,
}

pub fn emit_defindex_vault_updated(env: &Env, old_vault: Address, new_vault: Address) {
    env.events().publish(
        (VAULT_UPDATED,),
        DeFindexVaultUpdatedEvent { old_vault, new_vault },
    );
}

/// BlendTokenUpdated event payload.
#[contracttype]
pub struct BlendTokenUpdatedEvent {
    pub old_token: Address,
    pub new_token: Address,
}

pub fn emit_blend_token_updated(env: &Env, old_token: Address, new_token: Address) {
    env.events().publish(
        (TOKEN_UPDATED,),
        BlendTokenUpdatedEvent { old_token, new_token },
    );
}

/// UpgradeProposed event payload.
#[contracttype]
pub struct UpgradeProposedEvent {
    pub wasm_hash: BytesN<32>,
    pub ready_at: u64,
}

pub fn emit_upgrade_proposed(env: &Env, wasm_hash: BytesN<32>, ready_at: u64) {
    env.events().publish(
        (UPGRADE_PROPOSED,),
        UpgradeProposedEvent { wasm_hash, ready_at },
    );
}

/// UpgradeCancelled event payload.
#[contracttype]
pub struct UpgradeCancelledEvent {
    pub wasm_hash: BytesN<32>,
}

pub fn emit_upgrade_cancelled(env: &Env, wasm_hash: BytesN<32>) {
    env.events().publish(
        (UPGRADE_CANCELLED,),
        UpgradeCancelledEvent { wasm_hash },
    );
}

/// UpgradeExecuted event payload.
#[contracttype]
pub struct UpgradeExecutedEvent {
    pub wasm_hash: BytesN<32>,
    pub new_version: u32,
}

pub fn emit_upgrade_executed(env: &Env, wasm_hash: BytesN<32>, new_version: u32) {
    env.events().publish(
        (UPGRADE_EXECUTED,),
        UpgradeExecutedEvent { wasm_hash, new_version },
    );
}

pub fn emit_upgrades_locked(env: &Env) {
    env.events().publish((UPGRADES_LOCKED,), ());
}

pub fn emit_withdraw(
    env: &Env,
    caller: Address,
    deposit_id: String,
    token: Address,
    amount: i128,
    reward: i128,
) {
    env.events().publish(
        (WITHDRAW, caller),
        WithdrawEvent { deposit_id, token, amount, reward },
    );
}
