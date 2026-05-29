use soroban_sdk::{Address, Env};

use crate::error::BadgeError;
use crate::types::DataKey;

pub fn get_admin(env: &Env) -> Result<Address, BadgeError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(BadgeError::NotInitialized)
}

pub fn require_owner(env: &Env) -> Result<(), BadgeError> {
    get_admin(env)?.require_auth();
    Ok(())
}
