use soroban_sdk::Env;

use crate::admin;
use crate::error::BadgeError;
use crate::events;
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
    let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
    env.storage().instance().set(&DataKey::Paused, &true);
    env.storage().instance().extend_ttl(max_ttl, max_ttl);
    events::emit_paused(env, admin);
    Ok(())
}

pub fn unpause(env: &Env) -> Result<(), BadgeError> {
    admin::require_owner(env)?;
    let admin = admin::get_admin(env)?;
    let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
    env.storage().instance().set(&DataKey::Paused, &false);
    env.storage().instance().extend_ttl(max_ttl, max_ttl);
    events::emit_unpaused(env, admin);
    Ok(())
}
