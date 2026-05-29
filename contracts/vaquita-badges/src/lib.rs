#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Symbol};

mod admin;
mod error;
mod events;
mod mint_policy;
mod types;

pub use error::BadgeError;
pub use types::{DataKey, MintPolicy};

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

        // Policy-aware claim key — also validates cycle_id for OneTimeOnly types.
        let claim_key =
            mint_policy::effective_claim_key(&env, badge_type.clone(), cycle_id, wallet.clone())?;

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

        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();

        // EditionCap enforcement (if registered).
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

        mint_policy::increment_mint_count(&env, &badge_type);

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

    /// Returns whether `wallet` has claimed `badge_type`.
    ///
    /// Uses `effective_claim_key` to normalise the lookup: for `OneTimeOnly` badge types,
    /// the stored key always uses `cycle_id = 0` regardless of the argument passed here.
    /// If the effective claim key cannot be computed (e.g. `cycle_id != 0` for a
    /// `OneTimeOnly` type), returns `false`.
    pub fn has_claimed(env: Env, wallet: Address, badge_type: Symbol, cycle_id: u32) -> bool {
        mint_policy::effective_claim_key(&env, badge_type, cycle_id, wallet)
            .ok()
            .map(|key| env.storage().persistent().has(&key))
            .unwrap_or(false)
    }

    pub fn total_supply(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0)
    }

    /// Register a badge type with a mint policy and optional edition cap. Admin-only.
    ///
    /// Replaces the old `add_edition` entrypoint with a richer interface that sets
    /// the `MintPolicy` and optionally the edition cap in one atomic call.
    pub fn register_badge_type(
        env: Env,
        badge_type: Symbol,
        policy: MintPolicy,
        edition_cap: Option<u32>,
    ) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();

        env.storage()
            .instance()
            .set(&DataKey::MintPolicy(badge_type.clone()), &policy);

        if let Some(cap) = edition_cap {
            let cap_key = DataKey::EditionCap(badge_type.clone());
            env.storage().persistent().set(&cap_key, &cap);
            env.storage()
                .persistent()
                .extend_ttl(&cap_key, max_ttl, max_ttl);
        }

        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        events::emit_badge_type_registered(&env, badge_type, policy, edition_cap);
        Ok(())
    }

    /// Update the mint policy for a registered badge type. Admin-only.
    ///
    /// Loosening (`OneTimeOnly → PerCycle`) is blocked once any mint has been recorded
    /// for the badge type (`PolicyFrozen`). Tightening (`PerCycle → OneTimeOnly`) is
    /// always allowed.
    pub fn set_mint_policy(
        env: Env,
        badge_type: Symbol,
        policy: MintPolicy,
    ) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        let old_policy = mint_policy::get_policy(&env, &badge_type);

        // Block loosening after mints.
        if old_policy == MintPolicy::OneTimeOnly
            && policy == MintPolicy::PerCycle
            && mint_policy::get_mint_count(&env, &badge_type) > 0
        {
            return Err(BadgeError::PolicyFrozen);
        }

        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
        env.storage()
            .instance()
            .set(&DataKey::MintPolicy(badge_type.clone()), &policy);
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        events::emit_mint_policy_updated(&env, badge_type, old_policy, policy);
        Ok(())
    }

    /// Update the edition cap for a badge type. Admin-only.
    pub fn update_edition_cap(
        env: Env,
        badge_type: Symbol,
        new_cap: u32,
    ) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        let max_ttl = env.ledger().max_live_until_ledger() - env.ledger().sequence();
        let cap_key = DataKey::EditionCap(badge_type.clone());
        env.storage().persistent().set(&cap_key, &new_cap);
        env.storage()
            .persistent()
            .extend_ttl(&cap_key, max_ttl, max_ttl);
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
        events::emit_edition_cap_updated(&env, badge_type, new_cap);
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
