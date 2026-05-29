#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Symbol};

mod admin;
mod error;
mod events;
mod types;

pub use error::BadgeError;
pub use types::DataKey;

#[contract]
pub struct VaquitaBadges;

#[contractimpl]
impl VaquitaBadges {
    pub fn __constructor(env: Env, admin: Address, signing_key: BytesN<32>) {
        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &signing_key);
        env.storage().instance().set(&DataKey::NextTokenId, &0u32);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Version, &1u32);
        env.storage()
            .instance()
            .set(&DataKey::UpgradesLocked, &false);
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        events::emit_constructed(&env, admin, signing_key);
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

        // Hardened message: contract_address_xdr || wallet_xdr || badge_type_xdr || cycle_id_be4 || expiry_be8
        let mut msg = Bytes::new(&env);
        msg.append(&env.current_contract_address().to_xdr(&env));
        msg.append(&wallet.clone().to_xdr(&env));
        msg.append(&badge_type.clone().to_xdr(&env));
        msg.append(&Bytes::from_array(&env, &cycle_id.to_be_bytes()));
        msg.append(&Bytes::from_array(&env, &expiry.to_be_bytes()));

        let msg_hash = env.crypto().sha256(&msg);
        env.crypto()
            .ed25519_verify(&signing_key, &msg_hash.into(), &signature);

        // If an EditionCap was registered for this badge_type, enforce it.
        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
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
            let count_key = DataKey::EditionCount(badge_type.clone());
            env.storage().persistent().set(&count_key, &(count + 1));
            env.storage()
                .persistent()
                .extend_ttl(&count_key, max_ttl, max_ttl);
        }

        let token_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0);

        let owner_key = DataKey::TokenOwner(token_id);
        env.storage().persistent().set(&owner_key, &wallet);
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, max_ttl, max_ttl);

        let type_key = DataKey::TokenBadgeType(token_id);
        env.storage().persistent().set(&type_key, &badge_type);
        env.storage()
            .persistent()
            .extend_ttl(&type_key, max_ttl, max_ttl);

        env.storage().persistent().set(&claim_key, &());
        env.storage()
            .persistent()
            .extend_ttl(&claim_key, max_ttl, max_ttl);

        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));
        env.storage().instance().extend_ttl(max_ttl, max_ttl);

        events::emit_minted(&env, wallet, badge_type, cycle_id, token_id);
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
        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
        let cap_key = DataKey::EditionCap(edition_id.clone());
        env.storage().persistent().set(&cap_key, &max_supply);
        env.storage()
            .persistent()
            .extend_ttl(&cap_key, max_ttl, max_ttl);
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        events::emit_badge_type_registered(
            &env,
            edition_id,
            types::MintPolicy::OneTimeOnly,
            Some(max_supply),
        );
        Ok(())
    }

    pub fn update_signing_key(env: Env, new_key: BytesN<32>) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        let old_key: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::AdminSigningKey)
            .ok_or(BadgeError::NotInitialized)?;
        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &new_key);
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        events::emit_signing_key_rotated(&env, old_key, new_key);
        Ok(())
    }
}

#[cfg(test)]
mod test;
