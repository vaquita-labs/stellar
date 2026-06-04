use soroban_sdk::{BytesN, Env};

use crate::admin;
use crate::error::BadgeError;
use crate::events;
use crate::storage;
use crate::types::DataKey;

/// Fallback used when the timelock key is absent (e.g. contracts deployed
/// before the parameter was introduced).
const DEFAULT_TIMELOCK_SECS: u64 = 48 * 60 * 60; // 48 hours

pub fn get_version(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::Version).unwrap_or(1)
}

pub fn propose_upgrade(env: &Env, new_wasm_hash: BytesN<32>) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let locked: bool = env
        .storage()
        .instance()
        .get(&DataKey::UpgradesLocked)
        .unwrap_or(false);
    if locked {
        return Err(BadgeError::UpgradeLocked);
    }
    let timelock: u64 = env
        .storage()
        .instance()
        .get(&DataKey::UpgradeTimelockSecs)
        .unwrap_or(DEFAULT_TIMELOCK_SECS);
    let ready_at = env.ledger().timestamp() + timelock;
    env.storage()
        .instance()
        .set(&DataKey::PendingUpgradeHash, &new_wasm_hash);
    env.storage()
        .instance()
        .set(&DataKey::UpgradeReadyAt, &ready_at);
    storage::extend_instance(env);
    events::emit_upgrade_proposed(env, new_wasm_hash, ready_at);
    Ok(())
}

pub fn cancel_upgrade(env: &Env) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let pending_hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::PendingUpgradeHash)
        .ok_or(BadgeError::UpgradeNotProposed)?;
    env.storage()
        .instance()
        .remove(&DataKey::PendingUpgradeHash);
    env.storage().instance().remove(&DataKey::UpgradeReadyAt);
    storage::extend_instance(env);
    events::emit_upgrade_cancelled(env, pending_hash);
    Ok(())
}

pub fn execute_upgrade(env: &Env) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let pending_hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::PendingUpgradeHash)
        .ok_or(BadgeError::UpgradeNotProposed)?;
    let ready_at: u64 = env
        .storage()
        .instance()
        .get(&DataKey::UpgradeReadyAt)
        .ok_or(BadgeError::UpgradeNotProposed)?;
    if env.ledger().timestamp() < ready_at {
        return Err(BadgeError::UpgradeNotReady);
    }
    let version: u32 = get_version(env);
    let new_version = version + 1;
    env.storage()
        .instance()
        .remove(&DataKey::PendingUpgradeHash);
    env.storage().instance().remove(&DataKey::UpgradeReadyAt);
    env.storage()
        .instance()
        .set(&DataKey::Version, &new_version);
    storage::extend_instance(env);
    events::emit_upgrade_executed(env, pending_hash.clone(), new_version);
    env.deployer().update_current_contract_wasm(pending_hash);
    Ok(())
}

pub fn lock_upgrades_forever(env: &Env) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let admin = admin::get_admin(env)?;
    env.storage()
        .instance()
        .set(&DataKey::UpgradesLocked, &true);
    storage::extend_instance(env);
    events::emit_upgrades_locked(env, admin);
    Ok(())
}

pub fn update_upgrade_timelock_secs(env: &Env, new_secs: u64) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    env.storage()
        .instance()
        .set(&DataKey::UpgradeTimelockSecs, &new_secs);
    storage::extend_instance(env);
    Ok(())
}
