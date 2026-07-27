use soroban_sdk::{Address, Env};

use crate::error::VaquitaPoolError;
use crate::types::DataKey;

pub fn get_blend_token(env: &Env) -> Result<Address, VaquitaPoolError> {
    env.storage()
        .instance()
        .get(&DataKey::BlendToken)
        .ok_or(VaquitaPoolError::NotInitialized)
}

/// Update the BLEND token address. Fail-closed: blocked unless the pool holds
/// zero token-denominated value (no open positions, no reward pool, no protocol
/// fees). Positions already bind their own token (see `Position.token`), so this
/// only governs the *global* token used by future deposits; requiring zero
/// residual value prevents mixing two tokens in the single-token accounting and
/// closes the TTL-expiry bypass of the position counter (finding 038e5c7a).
pub fn set_blend_token(env: &Env, new_token: Address) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    let reward_pool: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalRewardPool)
        .unwrap_or(0);
    let protocol_fees: i128 = env
        .storage()
        .instance()
        .get(&DataKey::ProtocolFees)
        .unwrap_or(0);
    if crate::positions::outstanding_count(env) > 0 || reward_pool > 0 || protocol_fees > 0 {
        return Err(VaquitaPoolError::TokenRepointHasOutstandingPositions);
    }
    let old_token = get_blend_token(env)?;
    env.storage()
        .instance()
        .set(&DataKey::BlendToken, &new_token);
    crate::events::emit_blend_token_updated(env, old_token, new_token);
    Ok(())
}
