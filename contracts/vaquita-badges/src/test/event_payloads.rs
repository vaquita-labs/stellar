#![cfg(test)]
//! Verifies that every event `#[contracttype]` struct can be round-tripped
//! through `TryFromVal<Env, Val>`, asserting key fields on each deserialized
//! event.

use crate::events::{
    ConstructedEvent, EditionCapUpdatedEvent, MintedEvent, PausedEvent, SigningKeyRotatedEvent,
    UnpausedEvent, UpgradeCancelledEvent, UpgradeExecutedEvent, UpgradeProposedEvent,
    UpgradesLockedEvent,
};
use crate::test::EnvTestUtils;
use crate::{VaquitaBadges, VaquitaBadgesClient};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use soroban_sdk::testutils::{Address as _, BytesN as _, Events as _};
use soroban_sdk::{symbol_short, xdr::ToXdr, Address, Bytes, BytesN, Env, TryFromVal};

const TIMELOCK_48H: u64 = 172_800;

const UPGRADE_WASM: &[u8] =
    include_bytes!("../../../target/wasm32v1-none/release/vaquita_badges.wasm");

fn gen_key() -> SigningKey {
    SigningKey::generate(&mut OsRng)
}

fn make_sig(
    env: &Env,
    contract: &Address,
    key: &SigningKey,
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
    BytesN::from_array(env, &key.sign(&hash).to_bytes())
}

fn deploy(env: &Env) -> (Address, SigningKey, VaquitaBadgesClient<'_>) {
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths_allowing_non_root_auth();
    env.set_default_info();
    let admin = Address::generate(env);
    let key = gen_key();
    let pk: BytesN<32> = BytesN::from_array(env, &key.verifying_key().to_bytes());
    let id = env.register(VaquitaBadges, (admin, pk));
    let client = VaquitaBadgesClient::new(env, &id);
    (id, key, client)
}

fn last_val(e: &Env) -> soroban_sdk::Val {
    let (_, _, data) = e.events().all().last().unwrap();
    data
}

// ---- ConstructedEvent ----

#[test]
fn constructed_event_payload() {
    let e = Env::default();
    let (_, key, _) = deploy(&e);
    let expected_pk = BytesN::from_array(&e, &key.verifying_key().to_bytes());
    let ev = ConstructedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.signing_key, expected_pk);
}

// ---- MintedEvent ----

#[test]
fn minted_event_payload() {
    let e = Env::default();
    let (id, key, client) = deploy(&e);
    let bt = symbol_short!("gold");
    let wallet = Address::generate(&e);
    let expiry = e.ledger().timestamp() + 86_400 * 30;
    client.mint_badge(&wallet, &bt, &0, &expiry, &make_sig(&e, &id, &key, &wallet, &bt, 0, expiry));
    let ev = MintedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.badge_type, bt);
    assert_eq!(ev.wallet, wallet);
}

// ---- SigningKeyRotatedEvent ----

#[test]
fn signing_key_rotated_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    let new_pk: BytesN<32> = BytesN::from_array(&e, &gen_key().verifying_key().to_bytes());
    client.update_signing_key(&new_pk);
    let ev = SigningKeyRotatedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.new_key, new_pk);
}

// ---- EditionCapUpdatedEvent ----

#[test]
fn edition_cap_updated_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    let bt = symbol_short!("plat");
    client.update_edition_cap(&bt, &500u32);
    let ev = EditionCapUpdatedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.badge_type, bt);
    assert_eq!(ev.new_cap, 500u32);
}

// ---- PausedEvent / UnpausedEvent ----

#[test]
fn paused_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    client.pause();
    let ev = PausedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    let _ = ev.admin;
}

#[test]
fn unpaused_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    client.pause();
    client.unpause();
    let ev = UnpausedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    let _ = ev.admin;
}

// ---- Upgrade events ----

#[test]
fn upgrade_proposed_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    let hash: BytesN<32> = BytesN::random(&e);
    client.propose_upgrade(&hash);
    let ev = UpgradeProposedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.wasm_hash, hash);
}

#[test]
fn upgrade_cancelled_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    let hash: BytesN<32> = BytesN::random(&e);
    client.propose_upgrade(&hash);
    client.cancel_upgrade();
    let ev = UpgradeCancelledEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.wasm_hash, hash);
}

#[test]
fn upgrade_executed_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    let wasm_hash = e.deployer().upload_contract_wasm(UPGRADE_WASM);
    client.propose_upgrade(&wasm_hash);
    e.jump_time(TIMELOCK_48H + 1);
    client.execute_upgrade();
    let ev = UpgradeExecutedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.wasm_hash, wasm_hash);
    assert_eq!(ev.new_version, 2);
}

#[test]
fn upgrades_locked_event_payload() {
    let e = Env::default();
    let (_, _, client) = deploy(&e);
    client.lock_upgrades_forever();
    let ev = UpgradesLockedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    let _ = ev.admin;
}
