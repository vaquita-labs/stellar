#![cfg(test)]
use crate::test::{std::println, EnvTestUtils};
use crate::{VaquitaBadges, VaquitaBadgesClient};

use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Symbol,
};

// ---------- helpers ----------

fn generate_signing_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

/// Compute sha256(wallet_xdr || badge_type_xdr || cycle_id_be4 || expiry_be8)
/// mirroring the exact construction in mint_badge.
fn message_hash(
    env: &Env,
    wallet: &Address,
    badge_type: &Symbol,
    cycle_id: u32,
    expiry: u64,
) -> [u8; 32] {
    let mut msg = Bytes::new(env);
    msg.append(&wallet.to_xdr(env));
    msg.append(&badge_type.to_xdr(env));
    msg.append(&Bytes::from_array(env, &cycle_id.to_be_bytes()));
    msg.append(&Bytes::from_array(env, &expiry.to_be_bytes()));
    env.crypto().sha256(&msg).to_array()
}

fn make_signature(
    env: &Env,
    signing_key: &SigningKey,
    wallet: &Address,
    badge_type: &Symbol,
    cycle_id: u32,
    expiry: u64,
) -> BytesN<64> {
    let hash = message_hash(env, wallet, badge_type, cycle_id, expiry);
    let sig = signing_key.sign(&hash);
    BytesN::from_array(env, &sig.to_bytes())
}

fn deploy(env: &Env) -> (Address, SigningKey, VaquitaBadgesClient<'_>) {
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths_allowing_non_root_auth();
    env.set_default_info();

    let admin = Address::generate(env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> =
        BytesN::from_array(env, &signing_key.verifying_key().to_bytes());

    let contract_id = env.register(VaquitaBadges, ());
    let client = VaquitaBadgesClient::new(env, &contract_id);
    client.initialize(&admin, &pk_bytes);

    (admin, signing_key, client)
}

// ---------- Cycle 1: initialize stores admin and signing key ----------

#[test]
fn initialize_succeeds() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths_allowing_non_root_auth();
    env.set_default_info();

    let admin = Address::generate(&env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> =
        BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());

    let contract_id = env.register(VaquitaBadges, ());
    let client = VaquitaBadgesClient::new(&env, &contract_id);
    client.initialize(&admin, &pk_bytes);

    // Verify: total_supply starts at 0 (contract is live)
    assert_eq!(client.total_supply(), 0);
    println!("initialize_succeeds OK");
}

// ---------- Cycle 2: initialize reverts on re-init ----------

#[test]
#[should_panic(expected = "AlreadyInitialized")]
fn initialize_twice_panics() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    // second call — must panic
    let new_admin = Address::generate(&env);
    let new_key = generate_signing_key();
    let pk_bytes: BytesN<32> =
        BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.initialize(&new_admin, &pk_bytes);
}

// ---------- Cycle 3: mint_badge happy path ----------

#[test]
fn mint_badge_returns_token_id_and_increments_supply() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &signing_key, &wallet, &badge_type, cycle_id, expiry);

    let token_id = client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);
    assert_eq!(token_id, 0);
    assert_eq!(client.total_supply(), 1);

    // second distinct badge (Cat C uses cycle_id=0)
    let badge2 = symbol_short!("vaquita");
    let sig2 = make_signature(&env, &signing_key, &wallet, &badge2, 0, expiry);
    let token_id2 = client.mint_badge(&wallet, &badge2, &0, &expiry, &sig2);
    assert_eq!(token_id2, 1);
    assert_eq!(client.total_supply(), 2);

    println!("mint_badge_returns_token_id_and_increments_supply OK");
}

// ---------- Cycle 4: expiry check ----------

#[test]
#[should_panic(expected = "ClaimExpired")]
fn mint_badge_rejects_expired_claim() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    // expiry is in the past relative to ledger timestamp
    let expiry: u64 = env.ledger().timestamp() - 1;

    let sig = make_signature(&env, &signing_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);
}

// ---------- Cycle 5: double-claim prevention ----------

#[test]
#[should_panic(expected = "AlreadyClaimed")]
fn mint_badge_rejects_double_claim() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &signing_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);

    // second call with same (badge_type, cycle_id, wallet) must panic
    let sig2 = make_signature(&env, &signing_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig2);
}

// ---------- Cycle 6: invalid signature is rejected ----------

#[test]
#[should_panic]
fn mint_badge_rejects_wrong_signature() {
    let env = Env::default();
    let (_, _correct_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // sign with a *different* key — contract must reject
    let wrong_key = generate_signing_key();
    let sig = make_signature(&env, &wrong_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);
}

// ---------- Cycle 7: transfer is always blocked ----------

#[test]
#[should_panic(expected = "SoulboundToken")]
fn transfer_always_panics() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &signing_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);

    let other = Address::generate(&env);
    client.transfer(&wallet, &other, &0);
}

// ---------- Cycle 8: owner_of ----------

#[test]
fn owner_of_returns_minter_wallet() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &signing_key, &wallet, &badge_type, cycle_id, expiry);
    let token_id = client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);

    assert_eq!(client.owner_of(&token_id), Some(wallet));
    assert_eq!(client.owner_of(&999), None);

    println!("owner_of_returns_minter_wallet OK");
}

// ---------- Cycle 9: update_signing_key ----------

#[test]
fn update_signing_key_rotates_key() {
    let env = Env::default();
    let (admin, _old_key, client) = deploy(&env);

    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.update_signing_key(&admin, &new_pk);

    // mint with the new key must succeed
    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature(&env, &new_key, &wallet, &badge_type, cycle_id, expiry);
    let token_id = client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);
    assert_eq!(token_id, 0);

    println!("update_signing_key_rotates_key OK");
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn update_signing_key_non_admin_panics() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let non_admin = Address::generate(&env);
    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.update_signing_key(&non_admin, &new_pk);
}

// ---------- Cycle 10: old key rejected after rotation ----------

#[test]
#[should_panic]
fn mint_badge_with_old_key_fails_after_rotation() {
    let env = Env::default();
    let (admin, old_key, client) = deploy(&env);

    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.update_signing_key(&admin, &new_pk);

    // signing with the old key must now fail
    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature(&env, &old_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);
}
