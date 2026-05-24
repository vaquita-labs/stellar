use soroban_sdk::{Address, Env};

use crate::error::VaquitaPoolError;
use crate::types::DataKey;

/// Update the DeFindex vault address. Blocked while any positions are open.
pub fn set_vault_address(env: &Env, new_vault: Address) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    if crate::positions::outstanding_count(env) > 0 {
        return Err(VaquitaPoolError::VaultRepointHasOutstandingPositions);
    }
    let old_vault: Address = env
        .storage()
        .instance()
        .get(&DataKey::DeFindexVaultAddress)
        .ok_or(VaquitaPoolError::NotInitialized)?;
    env.storage()
        .instance()
        .set(&DataKey::DeFindexVaultAddress, &new_vault);
    crate::events::emit_defindex_vault_updated(env, old_vault, new_vault);
    Ok(())
}
