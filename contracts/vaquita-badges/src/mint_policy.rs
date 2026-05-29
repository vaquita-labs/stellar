use soroban_sdk::{Address, Env, Symbol};

use crate::error::BadgeError;
use crate::types::{DataKey, MintPolicy};

/// Returns the stored policy for `badge_type`, defaulting to `OneTimeOnly`
/// for unregistered types.
pub fn get_policy(env: &Env, badge_type: &Symbol) -> MintPolicy {
    env.storage()
        .instance()
        .get(&DataKey::MintPolicy(badge_type.clone()))
        .unwrap_or(MintPolicy::OneTimeOnly)
}

/// Returns the normalised `Claimed` key for the given (badge_type, cycle_id, wallet)
/// triple according to the badge type's registered policy.
///
/// - `OneTimeOnly`: validates `cycle_id == 0`; returns `Claimed(badge_type, 0, wallet)`.
/// - `PerCycle`: returns `Claimed(badge_type, cycle_id, wallet)`.
pub fn effective_claim_key(
    env: &Env,
    badge_type: Symbol,
    cycle_id: u32,
    wallet: Address,
) -> Result<DataKey, BadgeError> {
    match get_policy(env, &badge_type) {
        MintPolicy::OneTimeOnly => {
            if cycle_id != 0 {
                return Err(BadgeError::InvalidCycleId);
            }
            Ok(DataKey::Claimed(badge_type, 0, wallet))
        }
        MintPolicy::PerCycle => Ok(DataKey::Claimed(badge_type, cycle_id, wallet)),
    }
}

/// Increments the cumulative mint count for `badge_type` and bumps its TTL.
pub fn increment_mint_count(env: &Env, badge_type: &Symbol) {
    let key = DataKey::MintCount(badge_type.clone());
    let count: u32 = env.storage().persistent().get(&key).unwrap_or(0);
    let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
    env.storage().persistent().set(&key, &(count + 1));
    env.storage()
        .persistent()
        .extend_ttl(&key, max_ttl, max_ttl);
}

/// Returns the cumulative mint count for `badge_type` (0 if never minted).
pub fn get_mint_count(env: &Env, badge_type: &Symbol) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::MintCount(badge_type.clone()))
        .unwrap_or(0)
}
