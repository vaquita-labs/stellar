#![cfg(test)]
use crate::test::{std::println, EnvTestUtils};
use crate::{BadgeError, MintPolicy, VaquitaBadges, VaquitaBadgesClient};

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

    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes));
    let client = VaquitaBadgesClient::new(env, &contract_id);

    (contract_id, signing_key, client)
}

// ---------- Cycle 1: constructor sets initial state ----------

#[test]
fn constructor_sets_initial_state() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    assert_eq!(client.total_supply(), 0);
    println!("constructor_sets_initial_state OK");
}

// ---------- Cycle 2: initialize no longer callable ----------
// (Verified at compile time — no `initialize` method on VaquitaBadgesClient.)

// ---------- Cycle 3: mint_badge happy path ----------

#[test]
fn mint_badge_returns_token_id_and_increments_supply() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );

    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert_eq!(token_id, 0);
    assert_eq!(client.total_supply(), 1);

    let badge2 = symbol_short!("vaquita");
    let sig2 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge2,
        0,
        expiry,
    );
    let token_id2 = client.mint_badge(&wallet, &badge2, &0, &expiry, &sig2);
    assert_eq!(token_id2, 1);
    assert_eq!(client.total_supply(), 2);

    println!("mint_badge_returns_token_id_and_increments_supply OK");
}

// ---------- Cycle 4: hardened signature — old layout (without contract address) rejected ----------

#[test]
fn mint_badge_rejects_signature_without_contract_address() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // Build signature with OLD layout (no contract address prefix) — must be rejected.
    let mut msg = Bytes::new(&env);
    msg.append(&wallet.clone().to_xdr(&env));
    msg.append(&badge_type.clone().to_xdr(&env));
    msg.append(&Bytes::from_array(&env, &0u32.to_be_bytes()));
    msg.append(&Bytes::from_array(&env, &expiry.to_be_bytes()));
    let hash = env.crypto().sha256(&msg);
    let raw_sig = signing_key.sign(&hash.to_array());
    let sig = BytesN::from_array(&env, &raw_sig.to_bytes());

    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert!(
        result.is_err(),
        "signature without contract address must be rejected"
    );
}

// ---------- Cycle 5: hardened signature — wrong contract address rejected ----------

#[test]
fn mint_badge_rejects_signature_for_different_contract() {
    let env = Env::default();
    let (_, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    // Sign with a different (random) contract address
    let wrong_contract = Address::generate(&env);
    let sig = make_signature(
        &env,
        &wrong_contract,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );

    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert!(
        result.is_err(),
        "signature for wrong contract must be rejected"
    );
}

// ---------- Cycle 6: expiry check ----------

#[test]
fn mint_badge_rejects_expired_claim() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() - 1;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert_eq!(result, Err(Ok(BadgeError::ClaimExpired)));
}

// ---------- Cycle 7: double-claim prevention ----------

#[test]
fn mint_badge_rejects_double_claim() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    let sig2 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig2);
    assert_eq!(result, Err(Ok(BadgeError::AlreadyClaimed)));
}

// ---------- Cycle 8: invalid signature (wrong key) rejected ----------

#[test]
#[should_panic]
fn mint_badge_rejects_wrong_signature() {
    let env = Env::default();
    let (contract_id, _correct_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let wrong_key = generate_signing_key();
    let sig = make_signature(
        &env,
        &contract_id,
        &wrong_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
}

// ---------- Cycle 9: transfer is always blocked ----------

#[test]
fn transfer_always_fails() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    let other = Address::generate(&env);
    let result = client.try_transfer(&wallet, &other, &0);
    assert_eq!(result, Err(Ok(BadgeError::SoulboundToken)));
}

// ---------- Cycle 10: owner_of ----------

#[test]
fn owner_of_returns_minter_wallet() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    assert_eq!(client.owner_of(&token_id), Some(wallet));
    assert_eq!(client.owner_of(&999), None);

    println!("owner_of_returns_minter_wallet OK");
}

// ---------- Cycle 11: update_signing_key ----------

#[test]
fn update_signing_key_rotates_key() {
    let env = Env::default();
    let (contract_id, _old_key, client) = deploy(&env);

    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.update_signing_key(&new_pk);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature(
        &env,
        &contract_id,
        &new_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert_eq!(token_id, 0);

    println!("update_signing_key_rotates_key OK");
}

#[test]
fn update_signing_key_non_admin_rejected() {
    // No mock_all_auths — require_auth on admin will fail
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.set_default_info();

    let admin = Address::generate(&env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());

    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    let result = client.try_update_signing_key(&new_pk);
    assert!(result.is_err());
}

// ---------- Cycle 12: register_badge_type + EditionCap enforcement ----------

#[test]
fn register_badge_type_sets_cap_and_mints_up_to_cap() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let edition = symbol_short!("genesis");
    client.register_badge_type(&edition, &MintPolicy::OneTimeOnly, &Some(2u32));

    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let w1 = Address::generate(&env);
    let sig1 = make_signature(&env, &contract_id, &signing_key, &w1, &edition, 0, expiry);
    let t1 = client.mint_badge(&w1, &edition, &0, &expiry, &sig1);
    assert_eq!(t1, 0);

    let w2 = Address::generate(&env);
    let sig2 = make_signature(&env, &contract_id, &signing_key, &w2, &edition, 0, expiry);
    let t2 = client.mint_badge(&w2, &edition, &0, &expiry, &sig2);
    assert_eq!(t2, 1);

    println!("register_badge_type_sets_cap_and_mints_up_to_cap OK");
}

#[test]
fn mint_badge_rejects_beyond_edition_cap() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let edition = symbol_short!("genesis");
    client.register_badge_type(&edition, &MintPolicy::OneTimeOnly, &Some(1u32));

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
fn register_badge_type_non_admin_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.set_default_info();

    let admin = Address::generate(&env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());

    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    let result = client.try_register_badge_type(
        &symbol_short!("genesis"),
        &MintPolicy::OneTimeOnly,
        &Some(50u32),
    );
    assert!(result.is_err());
}

// ---------- Cycle 13: has_claimed ----------

#[test]
fn has_claimed_returns_false_before_mint_and_true_after() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    // PerCycle so non-zero cycle_ids are valid.
    client.register_badge_type(&badge_type, &MintPolicy::PerCycle, &None);
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    assert!(!client.has_claimed(&wallet, &badge_type, &cycle_id));

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        cycle_id,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);

    assert!(client.has_claimed(&wallet, &badge_type, &cycle_id));
    assert!(!client.has_claimed(&wallet, &badge_type, &202606u32));

    println!("has_claimed_returns_false_before_mint_and_true_after OK");
}

// ---------- Cycle 14: badge_type_of ----------

#[test]
fn badge_type_of_returns_correct_type() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    let token_id = client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    assert_eq!(client.badge_type_of(&token_id), Some(badge_type));
    assert_eq!(client.badge_type_of(&999), None);

    println!("badge_type_of_returns_correct_type OK");
}

// ---------- Cycle 15: full key-rotation lifecycle ----------

#[test]
fn key_rotation_invalidates_old_sig_and_accepts_new() {
    let env = Env::default();
    let (contract_id, key_a, client) = deploy(&env);

    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let badge_type = symbol_short!("gold");
    // PerCycle so distinct cycle_ids per wallet are valid.
    client.register_badge_type(&badge_type, &MintPolicy::PerCycle, &None);

    let wallet_1 = Address::generate(&env);
    let cycle_1: u32 = 202601;
    let sig_a = make_signature(
        &env,
        &contract_id,
        &key_a,
        &wallet_1,
        &badge_type,
        cycle_1,
        expiry,
    );
    let token_id = client.mint_badge(&wallet_1, &badge_type, &cycle_1, &expiry, &sig_a);
    assert_eq!(token_id, 0, "pre-rotation mint with key_A should succeed");

    let key_b = generate_signing_key();
    let pk_b: BytesN<32> = BytesN::from_array(&env, &key_b.verifying_key().to_bytes());
    client.update_signing_key(&pk_b);

    let wallet_stale = Address::generate(&env);
    let cycle_stale: u32 = 202602;
    let stale_sig = make_signature(
        &env,
        &contract_id,
        &key_a,
        &wallet_stale,
        &badge_type,
        cycle_stale,
        expiry,
    );
    let rejected = client.try_mint_badge(
        &wallet_stale,
        &badge_type,
        &cycle_stale,
        &expiry,
        &stale_sig,
    );
    assert!(
        rejected.is_err(),
        "old key_A signature must be rejected after rotation to key_B"
    );

    let wallet_2 = Address::generate(&env);
    let cycle_2: u32 = 202603;
    let sig_b = make_signature(
        &env,
        &contract_id,
        &key_b,
        &wallet_2,
        &badge_type,
        cycle_2,
        expiry,
    );
    let token_id2 = client.mint_badge(&wallet_2, &badge_type, &cycle_2, &expiry, &sig_b);
    assert_eq!(token_id2, 1, "new key_B mint should succeed after rotation");

    println!("key_rotation_invalidates_old_sig_and_accepts_new OK");
}

// ---------- Cycle 16: old key rejected after rotation ----------

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
    let sig = make_signature(
        &env,
        &contract_id,
        &old_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
}

// ---------- Cycle 17: MintPolicy system ----------

#[test]
fn onetimeonly_default_rejects_nonzero_cycle_id() {
    // Unregistered badge type defaults to OneTimeOnly; cycle_id != 0 must return InvalidCycleId.
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let cycle_id: u32 = 202605;
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        cycle_id,
        expiry,
    );
    let result = client.try_mint_badge(&wallet, &badge_type, &cycle_id, &expiry, &sig);
    assert_eq!(result, Err(Ok(BadgeError::InvalidCycleId)));
}

#[test]
fn registered_onetimeonly_blocks_remint_same_wallet() {
    // Explicit OneTimeOnly registration: first mint succeeds; second with cycle_id=0 fails.
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let badge_type = symbol_short!("gold");
    client.register_badge_type(&badge_type, &MintPolicy::OneTimeOnly, &None);

    let wallet = Address::generate(&env);
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig1 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig1);

    let sig2 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig2);
    assert_eq!(result, Err(Ok(BadgeError::AlreadyClaimed)));
}

#[test]
fn percycle_allows_different_cycles_blocks_same_twice() {
    // PerCycle: cycle_id=1 then cycle_id=2 both succeed; cycle_id=2 again fails.
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let badge_type = symbol_short!("streak");
    client.register_badge_type(&badge_type, &MintPolicy::PerCycle, &None);

    let wallet = Address::generate(&env);
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;

    let sig1 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        1,
        expiry,
    );
    let t1 = client.mint_badge(&wallet, &badge_type, &1, &expiry, &sig1);
    assert_eq!(t1, 0);

    let sig2 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        2,
        expiry,
    );
    let t2 = client.mint_badge(&wallet, &badge_type, &2, &expiry, &sig2);
    assert_eq!(t2, 1);

    let sig3 = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        2,
        expiry,
    );
    let result = client.try_mint_badge(&wallet, &badge_type, &2, &expiry, &sig3);
    assert_eq!(result, Err(Ok(BadgeError::AlreadyClaimed)));
}

#[test]
fn set_mint_policy_blocks_loosening_after_mints() {
    // Loosening (OneTimeOnly → PerCycle) is blocked once any mint has been recorded.
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let badge_type = symbol_short!("gold");
    client.register_badge_type(&badge_type, &MintPolicy::OneTimeOnly, &None);

    let wallet = Address::generate(&env);
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &0, &expiry, &sig);

    let result = client.try_set_mint_policy(&badge_type, &MintPolicy::PerCycle);
    assert_eq!(result, Err(Ok(BadgeError::PolicyFrozen)));
}

#[test]
fn set_mint_policy_allows_tightening_after_mints() {
    // Tightening (PerCycle → OneTimeOnly) is always allowed even after mints.
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let badge_type = symbol_short!("streak");
    client.register_badge_type(&badge_type, &MintPolicy::PerCycle, &None);

    let wallet = Address::generate(&env);
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        1,
        expiry,
    );
    client.mint_badge(&wallet, &badge_type, &1, &expiry, &sig);

    client.set_mint_policy(&badge_type, &MintPolicy::OneTimeOnly);
}

#[test]
fn has_claimed_onetimeonly_nonzero_cycle_returns_false() {
    // has_claimed returns false (not error) for OneTimeOnly type with cycle_id != 0.
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold"); // unregistered → default OneTimeOnly

    assert!(!client.has_claimed(&wallet, &badge_type, &202605));
}

#[test]
fn update_edition_cap_takes_effect_on_next_mint() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    let edition = symbol_short!("genesis");
    client.register_badge_type(&edition, &MintPolicy::OneTimeOnly, &Some(10u32));

    // Lower the cap to 1.
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
fn migrate_is_callable() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    client.migrate();
}
