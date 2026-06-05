use soroban_sdk::{Address, Env};

use crate::error::VaquitaPoolError;
use crate::types::DataKey;

/// The single gate through which every admin-only entrypoint must pass.
/// Reads `Admin` from instance storage and calls `require_auth()` on it.
/// Returns `NotInitialized` if the admin key hasn't been written yet
/// (should be unreachable after construction, but guards against misuse).
pub fn require_owner(env: &Env) -> Result<(), VaquitaPoolError> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(VaquitaPoolError::NotInitialized)?;
    admin.require_auth();
    Ok(())
}
