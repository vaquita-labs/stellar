use soroban_sdk::Env;

use crate::error::VaquitaPoolError;
use crate::types::DataKey;

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

pub fn require_not_paused(env: &Env) -> Result<(), VaquitaPoolError> {
    if is_paused(env) {
        Err(VaquitaPoolError::Paused)
    } else {
        Ok(())
    }
}

pub fn pause(env: &Env) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    env.storage().instance().set(&DataKey::Paused, &true);
    crate::events::emit_paused(env);
    Ok(())
}

pub fn unpause(env: &Env) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    env.storage().instance().set(&DataKey::Paused, &false);
    crate::events::emit_unpaused(env);
    Ok(())
}
