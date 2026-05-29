#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Symbol};

mod admin;
mod error;
mod types;

pub use error::BadgeError;
pub use types::DataKey;

#[contract]
pub struct VaquitaBadges;

#[contractimpl]
impl VaquitaBadges {
    pub fn initialize(env: Env, admin: Address, signing_key: BytesN<32>) -> Result<(), BadgeError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(BadgeError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &signing_key);
        env.storage().instance().set(&DataKey::NextTokenId, &0u32);
        Ok(())
    }

    pub fn mint_badge(
        env: Env,
        wallet: Address,
        badge_type: Symbol,
        cycle_id: u32,
        expiry: u64,
        signature: BytesN<64>,
    ) -> Result<u32, BadgeError> {
        wallet.require_auth();

        if env.ledger().timestamp() >= expiry {
            return Err(BadgeError::ClaimExpired);
        }

        let claim_key = DataKey::Claimed(badge_type.clone(), cycle_id, wallet.clone());
        if env.storage().persistent().has(&claim_key) {
            return Err(BadgeError::AlreadyClaimed);
        }

        let signing_key: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::AdminSigningKey)
            .ok_or(BadgeError::NotInitialized)?;

        let mut msg = Bytes::new(&env);
        msg.append(&wallet.clone().to_xdr(&env));
        msg.append(&badge_type.clone().to_xdr(&env));
        msg.append(&Bytes::from_array(&env, &cycle_id.to_be_bytes()));
        msg.append(&Bytes::from_array(&env, &expiry.to_be_bytes()));

        let msg_hash = env.crypto().sha256(&msg);
        env.crypto()
            .ed25519_verify(&signing_key, &msg_hash.into(), &signature);

        // If an EditionCap was registered for this badge_type, enforce it.
        let edition_cap_key = DataKey::EditionCap(badge_type.clone());
        if let Some(cap) = env
            .storage()
            .persistent()
            .get::<DataKey, u32>(&edition_cap_key)
        {
            let count: u32 = env
                .storage()
                .persistent()
                .get(&DataKey::EditionCount(badge_type.clone()))
                .unwrap_or(0);
            if count >= cap {
                return Err(BadgeError::EditionCapReached);
            }
            env.storage()
                .persistent()
                .set(&DataKey::EditionCount(badge_type.clone()), &(count + 1));
        }

        let token_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &wallet);
        env.storage()
            .persistent()
            .set(&DataKey::TokenBadgeType(token_id), &badge_type);
        env.storage().persistent().set(&claim_key, &());
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));

        Ok(token_id)
    }

    /// Always returns an error — badges are soulbound and non-transferable.
    pub fn transfer(
        _env: Env,
        _from: Address,
        _to: Address,
        _token_id: u32,
    ) -> Result<(), BadgeError> {
        Err(BadgeError::SoulboundToken)
    }

    pub fn owner_of(env: Env, token_id: u32) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
    }

    pub fn badge_type_of(env: Env, token_id: u32) -> Option<Symbol> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenBadgeType(token_id))
    }

    pub fn has_claimed(env: Env, wallet: Address, badge_type: Symbol, cycle_id: u32) -> bool {
        let claim_key = DataKey::Claimed(badge_type, cycle_id, wallet);
        env.storage().persistent().has(&claim_key)
    }

    pub fn total_supply(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0)
    }

    /// Register a new limited-edition badge type. Admin-only.
    pub fn add_edition(env: Env, edition_id: Symbol, max_supply: u32) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        env.storage()
            .persistent()
            .set(&DataKey::EditionCap(edition_id), &max_supply);
        Ok(())
    }

    pub fn update_signing_key(env: Env, new_key: BytesN<32>) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &new_key);
        Ok(())
    }
}

#[cfg(test)]
mod test;
