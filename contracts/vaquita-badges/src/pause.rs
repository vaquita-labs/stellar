use soroban_sdk::Env;

use crate::admin;
use crate::error::BadgeError;
use crate::events;
use crate::storage;
use crate::types::DataKey;

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

pub fn require_not_paused(env: &Env) -> Result<(), BadgeError> {
    if is_paused(env) {
        Err(BadgeError::Paused)
    } else {
        Ok(())
    }
}

pub fn pause(env: &Env) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let admin = admin::get_admin(env)?;
    env.storage().instance().set(&DataKey::Paused, &true);
    storage::extend_instance(env);
    events::emit_paused(env, admin);
    Ok(())
}

pub fn unpause(env: &Env) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let admin = admin::get_admin(env)?;
    env.storage().instance().set(&DataKey::Paused, &false);
    storage::extend_instance(env);
    events::emit_unpaused(env, admin);
    Ok(())
}
