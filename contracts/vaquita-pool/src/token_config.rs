use soroban_sdk::{Address, Env};

use crate::error::VaquitaPoolError;
use crate::types::DataKey;

pub fn get_blend_token(env: &Env) -> Result<Address, VaquitaPoolError> {
    env.storage()
        .instance()
        .get(&DataKey::BlendToken)
        .ok_or(VaquitaPoolError::NotInitialized)
}

/// Update the BLEND token address. Blocked while any positions are open.
pub fn set_blend_token(env: &Env, new_token: Address) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    if crate::positions::outstanding_count(env) > 0 {
        return Err(VaquitaPoolError::TokenRepointHasOutstandingPositions);
    }
    let old_token = get_blend_token(env)?;
    env.storage()
        .instance()
        .set(&DataKey::BlendToken, &new_token);
    crate::events::emit_blend_token_updated(env, old_token, new_token);
    Ok(())
}
