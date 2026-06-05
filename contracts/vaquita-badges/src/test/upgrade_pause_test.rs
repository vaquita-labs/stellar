#![cfg(test)]

use crate::test::EnvTestUtils;
use crate::{BadgeError, VaquitaBadges, VaquitaBadgesClient};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use soroban_sdk::{symbol_short, testutils::Address as _, xdr::ToXdr, Address, Bytes, BytesN, Env};

// ---------- helpers ----------

fn generate_signing_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

fn make_signature_raw(
    env: &Env,
    contract: &Address,
    signing_key: &SigningKey,
    wallet: &Address,
    badge_type: &soroban_sdk::Symbol,
    cycle_id: u32,
    expiry: u64,
) -> BytesN<64> {
    let mut msg = Bytes::new(env);
    msg.append(&contract.to_xdr(env));
    msg.append(&wallet.to_xdr(env));
    msg.append(&badge_type.to_xdr(env));
    msg.append(&Bytes::from_array(env, &cycle_id.to_be_bytes()));
    msg.append(&Bytes::from_array(env, &expiry.to_be_bytes()));
    let hash = env.crypto().sha256(&msg).to_array();
    let sig = signing_key.sign(&hash);
    BytesN::from_array(env, &sig.to_bytes())
}

/// Deploy with mock_all_auths; returns (contract_id, signing_key, client).
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

// ---------- pause tests ----------

#[test]
fn is_paused_returns_false_initially() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    assert!(!client.is_paused());
}

#[test]
fn pause_and_unpause_toggle_state() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    client.pause();
    assert!(client.is_paused());

    client.unpause();
    assert!(!client.is_paused());
}

#[test]
fn mint_badge_reverts_while_paused() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    client.pause();

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature_raw(
        &env,
        &contract_id,
        &signing_key,
        &wallet,
        &badge_type,
        0,
        expiry,
    );

    let result = client.try_mint_badge(&wallet, &badge_type, &0, &expiry, &sig);
    assert_eq!(result, Err(Ok(BadgeError::Paused)));
}

#[test]
fn admin_functions_work_while_paused() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    client.pause();

    // update_signing_key succeeds while paused
    let new_key = generate_signing_key();
    let new_pk: BytesN<32> = BytesN::from_array(&env, &new_key.verifying_key().to_bytes());
    client.update_signing_key(&new_pk);

    // update_edition_cap succeeds while paused
    client.update_edition_cap(&symbol_short!("gold"), &100u32);

    assert!(client.is_paused());
}

#[test]
fn unpause_restores_minting() {
    let env = Env::default();
    let (contract_id, signing_key, client) = deploy(&env);

    client.pause();
    client.unpause();

    let wallet = Address::generate(&env);
    let badge_type = symbol_short!("gold");
    let expiry: u64 = env.ledger().timestamp() + 86_400 * 30;
    let sig = make_signature_raw(
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
}

#[test]
fn pause_non_admin_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.set_default_info();

    let admin = Address::generate(&env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes, 172_800u64));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    assert!(client.try_pause().is_err());
}

// ---------- upgrade tests ----------

#[test]
fn version_returns_one_after_construction() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);
    assert_eq!(client.version(), 1);
}

#[test]
fn execute_upgrade_fails_with_no_pending_proposal() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let result = client.try_execute_upgrade();
    assert_eq!(result, Err(Ok(BadgeError::UpgradeNotProposed)));
}

#[test]
fn execute_upgrade_fails_before_timelock_elapses() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let fake_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.propose_upgrade(&fake_hash);

    // Immediately try to execute — timelock has not elapsed (48h required)
    let result = client.try_execute_upgrade();
    assert_eq!(result, Err(Ok(BadgeError::UpgradeNotReady)));
}

#[test]
fn cancel_upgrade_clears_pending_hash() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let fake_hash = BytesN::from_array(&env, &[2u8; 32]);
    client.propose_upgrade(&fake_hash);
    client.cancel_upgrade();

    // After cancel, execute should return UpgradeNotProposed
    let result = client.try_execute_upgrade();
    assert_eq!(result, Err(Ok(BadgeError::UpgradeNotProposed)));
}

#[test]
fn lock_upgrades_forever_blocks_further_proposals() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    client.lock_upgrades_forever();

    let fake_hash = BytesN::from_array(&env, &[3u8; 32]);
    let result = client.try_propose_upgrade(&fake_hash);
    assert_eq!(result, Err(Ok(BadgeError::UpgradeLocked)));
}

#[test]
fn cancel_upgrade_fails_with_no_pending_proposal() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    let result = client.try_cancel_upgrade();
    assert_eq!(result, Err(Ok(BadgeError::UpgradeNotProposed)));
}

#[test]
fn propose_upgrade_non_admin_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.set_default_info();

    let admin = Address::generate(&env);
    let signing_key = generate_signing_key();
    let pk_bytes: BytesN<32> = BytesN::from_array(&env, &signing_key.verifying_key().to_bytes());
    let contract_id = env.register(VaquitaBadges, (admin.clone(), pk_bytes, 172_800u64));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    let fake_hash = BytesN::from_array(&env, &[4u8; 32]);
    assert!(client.try_propose_upgrade(&fake_hash).is_err());
}

// ---------- upgrade_timelock_secs ----------

#[test]
fn constructor_stores_upgrade_timelock_secs() {
    // propose_upgrade uses the configured timelock to compute ready_at
    let env = Env::default();
    let timelock: u64 = 3_600; // 1 hour
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths_allowing_non_root_auth();
    env.set_default_info();

    let admin = Address::generate(&env);
    let key = generate_signing_key();
    let pk: BytesN<32> = BytesN::from_array(&env, &key.verifying_key().to_bytes());
    let contract_id = env.register(VaquitaBadges, (admin, pk, timelock));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    let hash = BytesN::from_array(&env, &[1u8; 32]);
    client.propose_upgrade(&hash);

    // Executing immediately must fail — timelock not yet elapsed
    let result = client.try_execute_upgrade();
    assert_eq!(result, Err(Ok(BadgeError::UpgradeNotReady)));

    // Jump exactly the configured timelock — no longer blocked by UpgradeNotReady
    env.jump_time(timelock);
    // execute_upgrade needs a real WASM; just confirm the timelock check passes
    let result2 = client.try_execute_upgrade();
    assert_ne!(result2, Err(Ok(BadgeError::UpgradeNotReady)));
}

#[test]
fn update_upgrade_timelock_secs_takes_effect_on_next_propose() {
    let env = Env::default();
    let (_, _, client) = deploy(&env);

    // Lower timelock to 60 seconds
    let new_timelock: u64 = 60;
    client.update_upgrade_timelock_secs(&new_timelock);

    let hash = BytesN::from_array(&env, &[5u8; 32]);
    client.propose_upgrade(&hash);

    // Jump only 60 seconds — timelock check should now pass
    env.jump_time(new_timelock);
    let result = client.try_execute_upgrade();
    assert_ne!(result, Err(Ok(BadgeError::UpgradeNotReady)));
}

#[test]
fn update_upgrade_timelock_secs_non_admin_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env.set_default_info();

    let admin = Address::generate(&env);
    let key = generate_signing_key();
    let pk: BytesN<32> = BytesN::from_array(&env, &key.verifying_key().to_bytes());
    let contract_id = env.register(VaquitaBadges, (admin, pk, 172_800u64));
    let client = VaquitaBadgesClient::new(&env, &contract_id);

    assert!(client.try_update_upgrade_timelock_secs(&3_600u64).is_err());
}
