#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Symbol};
use soroban_sdk::xdr::ToXdr;

mod error;
mod types;

pub use error::BadgeError;
pub use types::DataKey;

#[contract]
pub struct VaquitaBadges;

#[contractimpl]
impl VaquitaBadges {
    pub fn initialize(env: Env, admin: Address, signing_key: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("AlreadyInitialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::AdminSigningKey, &signing_key);
        env.storage().instance().set(&DataKey::NextTokenId, &0u32);
    }

    pub fn mint_badge(
        env: Env,
        wallet: Address,
        badge_type: Symbol,
        cycle_id: u32,
        expiry: u64,
        signature: BytesN<64>,
    ) -> u32 {
        wallet.require_auth();

        if env.ledger().timestamp() >= expiry {
            panic!("ClaimExpired");
        }

        let claim_key = DataKey::Claimed(badge_type.clone(), cycle_id, wallet.clone());
        if env.storage().persistent().has(&claim_key) {
            panic!("AlreadyClaimed");
        }

        let signing_key: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::AdminSigningKey)
            .unwrap();

        let mut msg = Bytes::new(&env);
        msg.append(&wallet.clone().to_xdr(&env));
        msg.append(&badge_type.clone().to_xdr(&env));
        msg.append(&Bytes::from_array(&env, &cycle_id.to_be_bytes()));
        msg.append(&Bytes::from_array(&env, &expiry.to_be_bytes()));

        let msg_hash = env.crypto().sha256(&msg);
        env.crypto()
            .ed25519_verify(&signing_key, &msg_hash.into(), &signature);

        let token_id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(token_id), &wallet);
        env.storage().persistent().set(&claim_key, &());
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &(token_id + 1));

        token_id
    }

    /// Always panics — badges are soulbound and non-transferable.
    pub fn transfer(_env: Env, _from: Address, _to: Address, _token_id: u32) {
        panic!("SoulboundToken");
    }

    pub fn owner_of(env: Env, token_id: u32) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::TokenOwner(token_id))
    }

    pub fn total_supply(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(0)
    }

    pub fn update_signing_key(env: Env, caller: Address, new_key: BytesN<32>) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic!("Unauthorized");
        }
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &new_key);
    }
}

#[cfg(test)]
mod test;
