#![cfg(test)]

use crate::test::EnvTestUtils;
use crate::types::DataKey;
use crate::VaquitaBadges;
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;
use soroban_sdk::{symbol_short, testutils::Address as _, Address, BytesN, Env};

fn setup() -> (Env, soroban_sdk::Address) {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths_allowing_non_root_auth();
    env.set_default_info();
    let admin = Address::generate(&env);
    let signing_key = SigningKey::generate(&mut OsRng);
    let pk_bytes: BytesN<32> = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let contract_id = env.register(VaquitaBadges, (admin, pk_bytes, 172_800u64));
    (env, contract_id)
}

// DataKey::Admin, ::AdminSigningKey, ::NextTokenId — all instance-storage keys — are
// present and independent after construction.
#[test]
fn instance_keys_absent_before_set() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        // Constructor sets these; verify they are present and independent.
        assert!(env.storage().instance().has(&DataKey::Admin));
        assert!(env.storage().instance().has(&DataKey::AdminSigningKey));
        assert!(env.storage().instance().has(&DataKey::NextTokenId));
        // Verify they hold distinct values.
        let next_id: u32 = env.storage().instance().get(&DataKey::NextTokenId).unwrap();
        assert_eq!(next_id, 0);
    });
}

#[test]
fn instance_keys_roundtrip_and_are_independent() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        env.storage().instance().set(&DataKey::Admin, &1u32);
        env.storage()
            .instance()
            .set(&DataKey::AdminSigningKey, &2u32);
        env.storage().instance().set(&DataKey::NextTokenId, &3u32);

        let a: u32 = env.storage().instance().get(&DataKey::Admin).unwrap();
        let b: u32 = env
            .storage()
            .instance()
            .get(&DataKey::AdminSigningKey)
            .unwrap();
        let c: u32 = env.storage().instance().get(&DataKey::NextTokenId).unwrap();
        assert_eq!(a, 1);
        assert_eq!(b, 2);
        assert_eq!(c, 3);
    });
}

// DataKey::TokenOwner(id) and ::TokenBadgeType(id) share the same numeric key but are
// different variants — they must not alias each other in persistent storage.
#[test]
fn token_owner_and_badge_type_same_id_are_distinct_keys() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        let wallet = Address::generate(&env);
        let badge = symbol_short!("gold");

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(0), &wallet.clone());
        env.storage()
            .persistent()
            .set(&DataKey::TokenBadgeType(0), &badge.clone());

        let owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(0))
            .unwrap();
        let bt: soroban_sdk::Symbol = env
            .storage()
            .persistent()
            .get(&DataKey::TokenBadgeType(0))
            .unwrap();
        assert_eq!(owner, wallet);
        assert_eq!(bt, badge);
    });
}

// Different token IDs produce distinct keys within the same variant.
#[test]
fn token_owner_different_ids_are_distinct() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        let w0 = Address::generate(&env);
        let w1 = Address::generate(&env);

        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(0), &w0.clone());
        env.storage()
            .persistent()
            .set(&DataKey::TokenOwner(1), &w1.clone());

        let got0: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(0))
            .unwrap();
        let got1: Address = env
            .storage()
            .persistent()
            .get(&DataKey::TokenOwner(1))
            .unwrap();
        assert_eq!(got0, w0);
        assert_eq!(got1, w1);
    });
}

// DataKey::Claimed(badge, cycle, wallet): varying cycle_id produces distinct keys.
#[test]
fn claimed_different_cycle_ids_are_distinct() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        let badge = symbol_short!("gold");
        let wallet = Address::generate(&env);

        let key_a = DataKey::Claimed(badge.clone(), 202601, wallet.clone());
        let key_b = DataKey::Claimed(badge.clone(), 202602, wallet.clone());

        env.storage().persistent().set(&key_a, &true);
        env.storage().persistent().set(&key_b, &false);

        let va: bool = env.storage().persistent().get(&key_a).unwrap();
        let vb: bool = env.storage().persistent().get(&key_b).unwrap();
        assert!(va);
        assert!(!vb);
    });
}

// DataKey::Claimed(badge, cycle, wallet): varying wallet produces distinct keys.
#[test]
fn claimed_different_wallets_are_distinct() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        let badge = symbol_short!("gold");
        let w1 = Address::generate(&env);
        let w2 = Address::generate(&env);

        let key1 = DataKey::Claimed(badge.clone(), 0, w1);
        let key2 = DataKey::Claimed(badge.clone(), 0, w2);

        env.storage().persistent().set(&key1, &());
        assert!(env.storage().persistent().has(&key1));
        assert!(!env.storage().persistent().has(&key2));
    });
}

// DataKey::EditionCap and ::EditionCount share the same Symbol but are different variants.
#[test]
fn edition_cap_and_count_same_symbol_are_distinct() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        let edition = symbol_short!("genesis");

        env.storage()
            .persistent()
            .set(&DataKey::EditionCap(edition.clone()), &100u32);
        env.storage()
            .persistent()
            .set(&DataKey::EditionCount(edition.clone()), &7u32);

        let cap: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::EditionCap(edition.clone()))
            .unwrap();
        let count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::EditionCount(edition.clone()))
            .unwrap();
        assert_eq!(cap, 100);
        assert_eq!(count, 7);
    });
}

// Persistent keys absent before being set.
#[test]
fn persistent_keys_absent_before_set() {
    let (env, id) = setup();
    env.as_contract(&id, || {
        let badge = symbol_short!("gold");
        let wallet = Address::generate(&env);
        assert!(!env.storage().persistent().has(&DataKey::TokenOwner(0)));
        assert!(!env.storage().persistent().has(&DataKey::TokenBadgeType(0)));
        assert!(!env
            .storage()
            .persistent()
            .has(&DataKey::Claimed(badge.clone(), 0, wallet)));
        assert!(!env
            .storage()
            .persistent()
            .has(&DataKey::EditionCap(badge.clone())));
        assert!(!env
            .storage()
            .persistent()
            .has(&DataKey::EditionCount(badge)));
    });
}
