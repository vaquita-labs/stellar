use soroban_sdk::{token::Client as TokenClient, Env};

use crate::arithmetic;
use crate::error::VaquitaPoolError;
use crate::types::DataKey;

/// Assert the conservation invariant:
///   contract_balance(BLEND) >= total_reward_pool + protocol_fees
///
/// Principal is held in the vault as shares, not directly by the contract.
/// The contract only holds reward and fee balances directly as BLEND.
/// Call this before every BLEND transfer that moves funds out of the contract.
pub fn assert_solvent(env: &Env) -> Result<(), VaquitaPoolError> {
    let blend_token = env
        .storage()
        .instance()
        .get(&DataKey::BlendToken)
        .ok_or(VaquitaPoolError::NotInitialized)?;
    let contract_address = env.current_contract_address();
    let balance = TokenClient::new(env, &blend_token).balance(&contract_address);

    let total_reward_pool: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalRewardPool)
        .unwrap_or(0);
    let protocol_fees: i128 = env
        .storage()
        .instance()
        .get(&DataKey::ProtocolFees)
        .unwrap_or(0);

    let required = arithmetic::checked_add(total_reward_pool, protocol_fees)?;

    if balance < required {
        return Err(VaquitaPoolError::ConservationInvariantViolated);
    }
    Ok(())
}

/// Add `delta` to the TotalPrincipal tracker.
pub fn add_principal(env: &Env, delta: i128) -> Result<(), VaquitaPoolError> {
    let current: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalPrincipal)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::TotalPrincipal, &arithmetic::checked_add(current, delta)?);
    Ok(())
}

/// Subtract `delta` from the TotalPrincipal tracker.
pub fn sub_principal(env: &Env, delta: i128) -> Result<(), VaquitaPoolError> {
    let current: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalPrincipal)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::TotalPrincipal, &arithmetic::checked_sub(current, delta)?);
    Ok(())
}

/// Add `delta` to the TotalRewardPool tracker.
pub fn add_reward_pool(env: &Env, delta: i128) -> Result<(), VaquitaPoolError> {
    let current: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalRewardPool)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::TotalRewardPool, &arithmetic::checked_add(current, delta)?);
    Ok(())
}

/// Subtract `delta` from the TotalRewardPool tracker.
pub fn sub_reward_pool(env: &Env, delta: i128) -> Result<(), VaquitaPoolError> {
    let current: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalRewardPool)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::TotalRewardPool, &arithmetic::checked_sub(current, delta)?);
    Ok(())
}
