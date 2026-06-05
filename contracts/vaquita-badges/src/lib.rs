#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Symbol};

mod admin;
mod error;
mod events;
mod pause;
mod storage;
mod types;
mod upgrade;

pub use error::BadgeError;
pub use types::DataKey;

#[contract]
pub struct VaquitaBadges;

#[contractimpl]
impl VaquitaBadges {
    pub fn __constructor(
        env: Env,
        admin: Address,
        signing_key: BytesN<32>,
        upgrade_timelock_secs: u64,
    ) {
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
        env.storage()
            .instance()
            .set(&DataKey::UpgradeTimelockSecs, &upgrade_timelock_secs);
        storage::extend_instance(&env);
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
        pause::require_not_paused(&env)?;

        if env.ledger().timestamp() >= expiry {
            return Err(BadgeError::ClaimExpired);
        }

        // cycle_id is a backend-controlled pass-through — no on-chain validation.
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

        // EditionCap enforcement (optional — only if a cap has been set).
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
            storage::extend_persistent(&env, &count_key);
        }

        let token_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0);

        let owner_key = DataKey::TokenOwner(token_id);
        env.storage().persistent().set(&owner_key, &wallet);
        storage::extend_persistent(&env, &owner_key);

        let type_key = DataKey::TokenBadgeType(token_id);
        env.storage().persistent().set(&type_key, &badge_type);
        storage::extend_persistent(&env, &type_key);

        env.storage().persistent().set(&claim_key, &());
        storage::extend_persistent(&env, &claim_key);

        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));
        storage::extend_instance(&env);

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

    /// Returns whether `wallet` has claimed `badge_type` for the given `cycle_id`.
    pub fn has_claimed(env: Env, wallet: Address, badge_type: Symbol, cycle_id: u32) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Claimed(badge_type, cycle_id, wallet))
    }

    pub fn total_supply(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0)
    }

    /// Set or update the edition cap for a badge type. Admin-only.
    /// No registration required — can be called for any badge type at any time.
    pub fn update_edition_cap(
        env: Env,
        badge_type: Symbol,
        new_cap: u32,
    ) -> Result<(), BadgeError> {
        admin::require_owner(&env)?;
        let cap_key = DataKey::EditionCap(badge_type.clone());
        env.storage().persistent().set(&cap_key, &new_cap);
        storage::extend_persistent(&env, &cap_key);
        storage::extend_instance(&env);
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
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &new_key);
        storage::extend_instance(&env);
        events::emit_signing_key_rotated(&env, old_key, new_key);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        pause::is_paused(&env)
    }

    pub fn pause(env: Env) -> Result<(), BadgeError> {
        pause::pause(&env)
    }

    pub fn unpause(env: Env) -> Result<(), BadgeError> {
        pause::unpause(&env)
    }

    pub fn version(env: Env) -> u32 {
        upgrade::get_version(&env)
    }

    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), BadgeError> {
        upgrade::propose_upgrade(&env, new_wasm_hash)
    }

    pub fn execute_upgrade(env: Env) -> Result<(), BadgeError> {
        upgrade::execute_upgrade(&env)
    }

    pub fn cancel_upgrade(env: Env) -> Result<(), BadgeError> {
        upgrade::cancel_upgrade(&env)
    }

    pub fn lock_upgrades_forever(env: Env) -> Result<(), BadgeError> {
        upgrade::lock_upgrades_forever(&env)
    }

    pub fn update_upgrade_timelock_secs(env: Env, new_secs: u64) -> Result<(), BadgeError> {
        upgrade::update_upgrade_timelock_secs(&env, new_secs)
    }

    /// No-op for v1; reserved for post-upgrade state migration.
    pub fn migrate(_env: Env) {}
}

#[cfg(test)]
mod test;
