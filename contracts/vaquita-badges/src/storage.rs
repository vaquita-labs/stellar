//! Centralised TTL-extension helpers for vaquita-badges.
//!
//! Every state-changing call should end with `storage::extend_instance`.
//! Writes to persistent storage should pair with `storage::extend_persistent`
//! on the touched key so the entry is never archived while the contract is
//! actively used.
//!
//! Both helpers always extend to the ledger's maximum live-until point
//! (currently 365 days on Stellar mainnet).  Soulbound badges must not
//! expire, and admin config is equally long-lived.

use soroban_sdk::Env;

use crate::types::DataKey;

fn max_ttl(env: &Env) -> u32 {
    env.ledger().max_live_until_ledger() - env.ledger().sequence()
}

/// Bump instance storage TTL to the current ledger maximum.
pub fn extend_instance(env: &Env) {
    let ttl = max_ttl(env);
    env.storage().instance().extend_ttl(ttl, ttl);
}

/// Bump a persistent entry's TTL to the current ledger maximum.
pub fn extend_persistent(env: &Env, key: &DataKey) {
    let ttl = max_ttl(env);
    env.storage().persistent().extend_ttl(key, ttl, ttl);
}
