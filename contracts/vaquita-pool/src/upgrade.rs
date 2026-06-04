use soroban_sdk::{Address, BytesN, Env};

use crate::error::VaquitaPoolError;
use crate::types::DataKey;

pub fn propose_upgrade(env: &Env, new_wasm_hash: BytesN<32>) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;

    if env
        .storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::UpgradesLocked)
        .unwrap_or(false)
    {
        return Err(VaquitaPoolError::UpgradeLocked);
    }

    if env.storage().instance().has(&DataKey::PendingUpgradeHash) {
        return Err(VaquitaPoolError::UpgradeNotReady);
    }

    let timelock: u64 = env
        .storage()
        .instance()
        .get(&DataKey::UpgradeTimelockSecs)
        .unwrap_or(0);
    let ready_at = env.ledger().timestamp().saturating_add(timelock);

    env.storage()
        .instance()
        .set(&DataKey::PendingUpgradeHash, &new_wasm_hash);
    env.storage()
        .instance()
        .set(&DataKey::UpgradeReadyAt, &ready_at);

    crate::events::emit_upgrade_proposed(env, new_wasm_hash, ready_at);
    Ok(())
}

pub fn cancel_upgrade(env: &Env) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;

    if !env.storage().instance().has(&DataKey::PendingUpgradeHash) {
        return Err(VaquitaPoolError::UpgradeNotProposed);
    }

    let hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::PendingUpgradeHash)
        .unwrap();
    env.storage()
        .instance()
        .remove(&DataKey::PendingUpgradeHash);
    env.storage().instance().remove(&DataKey::UpgradeReadyAt);

    crate::events::emit_upgrade_cancelled(env, hash);
    Ok(())
}

pub fn execute_upgrade(env: &Env) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;

    if env
        .storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::UpgradesLocked)
        .unwrap_or(false)
    {
        return Err(VaquitaPoolError::UpgradeLocked);
    }

    let hash: BytesN<32> = env
        .storage()
        .instance()
        .get(&DataKey::PendingUpgradeHash)
        .ok_or(VaquitaPoolError::UpgradeNotProposed)?;

    let ready_at: u64 = env
        .storage()
        .instance()
        .get(&DataKey::UpgradeReadyAt)
        .unwrap_or(0);

    if env.ledger().timestamp() < ready_at {
        return Err(VaquitaPoolError::UpgradeNotReady);
    }

    env.storage()
        .instance()
        .remove(&DataKey::PendingUpgradeHash);
    env.storage().instance().remove(&DataKey::UpgradeReadyAt);

    let old_version: u32 = env.storage().instance().get(&DataKey::Version).unwrap_or(1);
    let new_version = old_version.saturating_add(1);
    env.storage()
        .instance()
        .set(&DataKey::Version, &new_version);

    crate::events::emit_upgrade_executed(env, hash.clone(), new_version);

    env.deployer().update_current_contract_wasm(hash);
    Ok(())
}

pub fn lock_upgrades_forever(env: &Env) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;

    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(VaquitaPoolError::NotInitialized)?;

    env.storage()
        .instance()
        .set(&DataKey::UpgradesLocked, &true);

    crate::events::emit_upgrades_locked(env, admin);
    Ok(())
}

pub fn version(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::Version).unwrap_or(1)
}

pub fn update_upgrade_timelock_secs(
    env: &Env,
    new_secs: u64,
) -> Result<(), crate::VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    env.storage()
        .instance()
        .set(&DataKey::UpgradeTimelockSecs, &new_secs);
    Ok(())
}
