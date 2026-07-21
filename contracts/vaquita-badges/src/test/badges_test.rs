#![cfg(test)]
use crate::test::{std::println, EnvTestUtils};
use crate::{BadgeError, VaquitaBadges, VaquitaBadgesClient};

use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use soroban_sdk::{
    symbol_short, testutils::Address as _, xdr::ToXdr, Address, Bytes, BytesN, Env, Symbol,
};

// ---------- helpers ----------

fn generate_signing_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

/// Compute sha256(contract_address_xdr || wallet_xdr || badge_type_xdr || cycle_id_be4 || expiry_be8)
fn message_hash(
    env: &Env,
    contract: &Address,
    wallet: &Address,
    badge_type: &Symbol,
    cycle_id: u32,
    expiry: u64,
) -> [u8; 32] {
    let mut msg = Bytes::new(env);
    msg.append(&contract.to_xdr(env));
    msg.append(&wallet.to_xdr(env));
    msg.append(&badge_type.to_xdr(env));
    msg.append(&Bytes::from_array(env, &cycle_id.to_be_bytes()));
    msg.append(&Bytes::from_array(env, &expiry.to_be_bytes()));
    env.crypto().sha256(&msg).to_array()
}

fn make_signature(
    env: &Env,
    contract: &Address,
    signing_key: &SigningKey,
    wallet: &Address,
    badge_type: &Symbol,
    cycle_id: u32,
    expiry: u64,
) -> BytesN<64> {
    let hash = message_hash(env, contract, wallet, badge_type, cycle_id, expiry);
    let sig = signing_key.sign(&hash);
    BytesN::from_array(env, &sig.to_bytes())
}

/// Deploy via __constructor; returns (contract_address, signing_key, client).
fn deploy(env: &Env) -> (Address, SigningKey, VaquitaBadgesClient<'_>) {
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths_allowing_non_root_auth();
    env.set_default_info();

    let admin = Address::generate(env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> = BytesN::from_array(env, &signing_key.verifying_key().to_bytes());

    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes, 172_800u64));
    let client = VaquitaBadgesClient::new(env, &contract_id);

    (contract_id, signing_key, client)
}

// ---------- constructor ----------

#[test]
fn constructor_sets_initial_state() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    assert_eq!(client.total_supply(), 0);
    println!("constructor_sets_initial_state OK");
}

// ---------- mint_badge happy path ----------

#[test]
fn mint_badge_returns_token_id_and_increments_supply() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, 0, expiry);

    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert_eq!(token_id, 0);
    assert_eq!(client.total_supply(), 1);

    let wallet2 = Address::generate(&env);
    let sig2 = make_signature(&env, &contract_id, &signing_key, &wallet2, &badge_type, 0, expiry);
    let token_id2 = client.mint_badge(&wallet2, &badge_type, &0, &expiry, &sig2);
    assert_eq!(token_id2, 1);
    assert_eq!(client.total_supply(), 2);

    println!("mint_badge_returns_token_id_and_increments_supply OK");
}

#[test]
fn mint_badge_rejects_signature_without_contract_address() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // Build message without contract address prefix
    let mut msg = Bytes::new(&env);
    msg.append(&wallet.clone().to_xdr(&env));
    msg.append(&badge_type.clone().to_xdr(&env));
    msg.append(&Bytes::from_array(&env, &0u32.to_be_bytes()));
    msg.append(&Bytes::from_array(&env, &expiry.to_be_bytes()));
    let hash = env.crypto().sha256(&msg).to_array();
    let sig = BytesN::from_array(&env, &signing_key.sign(&hash).to_bytes());

    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert!(result.is_err());
}

#[test]
fn mint_badge_rejects_signature_for_different_contract() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let other_contract = Address::generate(&env);
    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // Sign with a different contract address
    let sig = make_signature(&env, &other_contract, &signing_key, &wallet, &badge_type, 0, expiry);
    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert!(result.is_err());
}

#[test]
fn mint_badge_rejects_expired_claim() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp(); // already expired

    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, 0, expiry);
    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert_eq!(result, Err(Ok(BadgeError::ClaimExpired)));
}

#[test]
fn mint_badge_rejects_double_claim() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, 0, expiry);
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    let sig2 = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, 0, expiry);
    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig2);
    assert_eq!(result, Err(Ok(BadgeError::AlreadyClaimed)));
}

#[test]
#[should_panic]
fn mint_badge_rejects_wrong_signature() {
    let env = Env::default();
    let (contract_id, _, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // Sign with a random key not registered in the contract
    let rogue_key = generate_signing_key();
    let sig = make_signature(&env, &contract_id, &rogue_key, &wallet, &badge_type, 0, expiry);
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
}

// ---------- no registration required — any cycle_id accepted ----------

#[test]
fn any_cycle_id_mints_without_registration() {
    // No register_badge_type call; backend passes any cycle_id freely.
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("streak");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // Non-zero cycle_id works without registration
    let cycle: u32 = 202605;
    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, cycle, expiry);
    let token_id = client.mint_badge(&wallet, &badge_type, &cycle, &expiry, &sig);
    assert_eq!(token_id, 0);

    // Different cycle for the same wallet+badge_type also works
    let cycle2: u32 = 202606;
    let sig2 = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, cycle2, expiry);
    let token_id2 = client.mint_badge(&wallet, &badge_type, &cycle2, &expiry, &sig2);
    assert_eq!(token_id2, 1);

    // Same (badge_type, cycle_id, wallet) is still blocked
    let sig3 = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, cycle, expiry);
    let result = client.try_mint_badge(&wallet, &badge_type, &cycle, &expiry, &sig3);
    assert_eq!(result, Err(Ok(BadgeError::AlreadyClaimed)));
}

// ---------- transfer ----------

#[test]
fn transfer_always_fails() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let from = Address::generate(&env);
    let to = Address::generate(&env);
    let result = client.try_transfer(&from, &to, &0u32);
    assert_eq!(result, Err(Ok(BadgeError::SoulboundToken)));
}

// ---------- owner_of ----------

#[test]
fn owner_of_returns_minter_wallet() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, 0, expiry);
    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    assert_eq!(client.owner_of(&token_id), Some(wallet));
    assert_eq!(client.owner_of(&999u32), None);
}

// ---------- update_signing_key ----------

#[test]
fn update_signing_key_rotates_key() {
    let env = Env::default();
    let (contract_id, key_a, client) = deploy(&env);

    let key_b = generate_signing_key();
    let pk_b: BytesN<32> = BytesN::from_array(&env, &key_b.verifying_key().to_bytes());
    client.update_signing_key(&pk_b);

    // key_b now works
    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig_b = make_signature(&env, &contract_id, &key_b, &wallet, &badge_type, 0, expiry);
    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig_b);
    assert_eq!(token_id, 0);

    // key_a no longer works
    let wallet2 = Address::generate(&env);
    let sig_a = make_signature(&env, &contract_id, &key_a, &wallet2, &badge_type, 0, expiry);
    let result = client.try_mint_badge(&wallet2, &badge_type, &0, &expiry, &sig_a);
    assert!(result.is_err());
}

#[test]
fn update_signing_key_non_admin_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.set_default_info();

    let admin = Address::generate(&env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes, 172_800u64));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    let new_pk: BytesN<32> = BytesN::from_array(&env, &generate_signing_key().verifying_key().to_bytes());
    assert!(client.try_update_signing_key(&new_pk).is_err());
}

// ---------- EditionCap enforcement ----------

#[test]
fn edition_cap_enforced_up_to_cap() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let edition = symbol_short!("genesis");
    client.update_edition_cap(&edition, &2u32);

    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let w1 = Address::generate(&env);
    let sig1 = make_signature(&env, &contract_id, &signing_key, &w1, &edition, 0, expiry);
    assert_eq!(client.mint_badge(&w1, &edition, &0, &expiry, &sig1), 0);

    let w2 = Address::generate(&env);
    let sig2 = make_signature(&env, &contract_id, &signing_key, &w2, &edition, 0, expiry);
    assert_eq!(client.mint_badge(&w2, &edition, &0, &expiry, &sig2), 1);
}

#[test]
fn mint_badge_rejects_beyond_edition_cap() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let edition = symbol_short!("genesis");
    client.update_edition_cap(&edition, &1u32);

    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let w1 = Address::generate(&env);
    let sig1 = make_signature(&env, &contract_id, &signing_key, &w1, &edition, 0, expiry);
    client.mint_badge(&w1, &edition, &0, &expiry, &sig1);

    let w2 = Address::generate(&env);
    let sig2 = make_signature(&env, &contract_id, &signing_key, &w2, &edition, 0, expiry);
    let result = client.try_mint_badge(&w2, &edition, &0, &expiry, &sig2);
    assert_eq!(result, Err(Ok(BadgeError::EditionCapReached)));
}

#[test]
fn update_edition_cap_takes_effect_on_next_mint() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let edition = symbol_short!("genesis");
    client.update_edition_cap(&edition, &10u32);
    // Lower the cap to 1
    client.update_edition_cap(&edition, &1u32);

    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let w1 = Address::generate(&env);
    let sig1 = make_signature(&env, &contract_id, &signing_key, &w1, &edition, 0, expiry);
    client.mint_badge(&w1, &edition, &0, &expiry, &sig1);

    let w2 = Address::generate(&env);
    let sig2 = make_signature(&env, &contract_id, &signing_key, &w2, &edition, 0, expiry);
    let result = client.try_mint_badge(&w2, &edition, &0, &expiry, &sig2);
    assert_eq!(result, Err(Ok(BadgeError::EditionCapReached)));
}

// ---------- has_claimed ----------

#[test]
fn has_claimed_returns_false_before_mint_and_true_after() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    assert!(!client.has_claimed(&wallet, &badge_type, &cycle_id));

    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, cycle_id, expiry);
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);

    assert!(client.has_claimed(&wallet, &badge_type, &cycle_id));
    assert!(!client.has_claimed(&wallet, &badge_type, &202606u32));

    println!("has_claimed_returns_false_before_mint_and_true_after OK");
}

// ---------- badge_type_of ----------

#[test]
fn badge_type_of_returns_correct_type() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(&env, &contract_id, &signing_key, &wallet, &badge_type, 0, expiry);
    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    assert_eq!(client.badge_type_of(&token_id), Some(badge_type));
    assert_eq!(client.badge_type_of(&999), None);

    println!("badge_type_of_returns_correct_type OK");
}

// ---------- key rotation lifecycle ----------

#[test]
fn key_rotation_invalidates_old_sig_and_accepts_new() {
    let env = Env::default();
    let (contract_id, key_a, client) = deploy(&env);

    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let badge_type = symbol_short!("gold");

    let wallet_1 = Address::generate(&env);
    let sig_a = make_signature(&env, &contract_id, &key_a, &wallet_1, &badge_type, 202601, expiry);
    let token_id = client.mint_badge(&wallet_1, &badge_type, &202601, &expiry, &sig_a);
    assert_eq!(token_id, 0, "pre-rotation mint with key_A should succeed");

    let key_b = generate_signing_key();
    let pk_b: BytesN<32> = BytesN::from_array(&env, &key_b.verifying_key().to_bytes());
    client.update_signing_key(&pk_b);

    let wallet_stale = Address::generate(&env);
    let stale_sig = make_signature(&env, &contract_id, &key_a, &wallet_stale, &badge_type, 202602, expiry);
    let rejected = client.try_mint_badge(&wallet_stale, &badge_type, &202602, &expiry, &stale_sig);
    assert!(rejected.is_err(), "old key_A signature must be rejected after rotation");

    let wallet_2 = Address::generate(&env);
    let sig_b = make_signature(&env, &contract_id, &key_b, &wallet_2, &badge_type, 202603, expiry);
    let token_id2 = client.mint_badge(&wallet_2, &badge_type, &202603, &expiry, &sig_b);
    assert_eq!(token_id2, 1, "new key_B mint should succeed after rotation");

    println!("key_rotation_invalidates_old_sig_and_accepts_new OK");
}

#[test]
#[should_panic]
fn mint_badge_with_old_key_fails_after_rotation() {
    let env = Env::default();
    let (contract_id, old_key, client) = deploy(&env);

    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.update_signing_key(&new_pk);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature(&env, &contract_id, &old_key, &wallet, &badge_type, 0, expiry);
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
}

// ---------- migrate ----------

#[test]
fn migrate_is_callable() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    client.migrate();
}
