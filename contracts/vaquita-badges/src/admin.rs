use soroban_sdk::{Address, Env};

use crate::error::BadgeError;
use crate::types::DataKey;

pub fn require_owner(env: &Env) -> Result<(), BadgeError> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(BadgeError::NotInitialized)?;
    admin.require_auth();
    Ok(())
}
