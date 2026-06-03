#![cfg(test)]
//! Verifies that every event `#[contracttype]` struct can be round-tripped
//! through `TryFromVal<Env, Val>`, asserting key fields on each deserialized
//! event.  This also confirms that `IntoVal<Env, Val>` (the serialisation
//! direction) is exercised via `env.events().publish(…)`.

use crate::events::{
    BlendTokenUpdatedEvent, ConstructedEvent, DeFindexVaultUpdatedEvent, DepositEvent,
    EarlyWithdrawalFeeUpdatedEvent, LockPeriodAddedEvent, LockPeriodRemovedEvent, PausedEvent,
    ProtocolFeesWithdrawnEvent, RewardsAddedEvent, UnpausedEvent, UpgradeCancelledEvent,
    UpgradeExecutedEvent, UpgradeProposedEvent, UpgradesLockedEvent, WithdrawEvent,
};
use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::{Address as _, BytesN as _, Events as _};
use soroban_sdk::{Address, BytesN, Env, String, TryFromVal, Vec};

const LOCK_7D: u64 = 604_800;
const TIMELOCK_48H: u64 = 172_800;

const UPGRADE_WASM: &[u8] =
    include_bytes!("../../../target/wasm32v1-none/release/vaquita_pool.wasm");

fn setup(
    e: &Env,
) -> (
    Address,
    Address,
    Address,
    VaquitaPoolClient<'_>,
    MockDeFindexVaultClient<'_>,
    MockTokenClient<'_>,
) {
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
    e.set_default_info();
    let admin = Address::generate(e);
    let alice = Address::generate(e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let vault_addr = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let vault_client = MockDeFindexVaultClient::new(e, &vault_addr);
    let lp: Vec<u64> = Vec::from_array(e, [LOCK_7D]);
    let pool_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            vault_addr.clone(),
            lp,
            500i128,
            TIMELOCK_48H,
        ),
    );
    (
        admin,
        alice,
        vault_addr,
        VaquitaPoolClient::new(e, &pool_id),
        vault_client,
        MockTokenClient::new(e, &usdc.address()),
    )
}

fn last_val(e: &Env) -> soroban_sdk::Val {
    let (_, _, data) = e.events().all().last().unwrap();
    data
}

// ---- ConstructedEvent ----

#[test]
fn constructed_event_payload() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
    e.set_default_info();
    let admin = Address::generate(&e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let vault_addr = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let lp: Vec<u64> = Vec::from_array(&e, [LOCK_7D]);
    e.register(
        VaquitaPool,
        (admin, usdc.address(), vault_addr.clone(), lp, 0i128, TIMELOCK_48H),
    );
    let ev = ConstructedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.defindex_vault, vault_addr);
}

// ---- DepositEvent ----

#[test]
fn deposit_event_payload() {
    let e = Env::default();
    let (_, alice, _, pool, _, tok) = setup(&e);
    let amount: i128 = 1_000_000;
    tok.mint(&alice, &amount);
    let dep = String::from_str(&e, "d1");
    pool.deposit(&alice, &dep, &amount, &LOCK_7D);
    let ev = DepositEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.amount, amount);
    assert_eq!(ev.deposit_id, dep);
}

// ---- WithdrawEvent ----

#[test]
fn withdraw_event_payload() {
    let e = Env::default();
    let (_, alice, _, pool, _, tok) = setup(&e);
    tok.mint(&alice, &1_000_000i128);
    let dep = String::from_str(&e, "w1");
    pool.deposit(&alice, &dep, &1_000_000i128, &LOCK_7D);
    pool.withdraw(&alice, &dep);
    let ev = WithdrawEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.deposit_id, dep);
    assert_eq!(ev.reward, 0);
}

// ---- EarlyWithdrawalFeeUpdatedEvent ----

#[test]
fn fee_updated_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    pool.update_early_withdrawal_fee(&1500i128);
    let ev = EarlyWithdrawalFeeUpdatedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.old_fee, 500);
    assert_eq!(ev.new_fee, 1500);
}

// ---- RewardsAddedEvent ----

#[test]
fn rewards_added_event_payload() {
    let e = Env::default();
    let (admin, alice, _, pool, _, tok) = setup(&e);
    tok.mint(&alice, &1_000_000i128);
    pool.deposit(&alice, &String::from_str(&e, "r1"), &1_000_000i128, &LOCK_7D);
    tok.mint(&admin, &50_000i128);
    pool.add_rewards(&LOCK_7D, &50_000i128);
    let ev = RewardsAddedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.period, LOCK_7D);
    assert_eq!(ev.amount, 50_000);
}

// ---- ProtocolFeesWithdrawnEvent ----

#[test]
fn protocol_fees_withdrawn_event_payload() {
    let e = Env::default();
    let (admin, alice, vault_addr, pool, vault, tok) = setup(&e);
    tok.mint(&alice, &2_000_000i128);
    pool.deposit(&alice, &String::from_str(&e, "pf1"), &2_000_000i128, &LOCK_7D);
    tok.mint(&vault_addr, &400_000i128);
    vault.test_set_withdraw_adjustment(&400_000i128);
    e.jump_time(LOCK_7D / 2);
    pool.withdraw(&alice, &String::from_str(&e, "pf1"));
    pool.withdraw_protocol_fees();
    let ev = ProtocolFeesWithdrawnEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.admin, admin);
    assert!(ev.amount > 0);
}

// ---- PausedEvent / UnpausedEvent ----

#[test]
fn paused_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    pool.pause();
    let ev = PausedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    let _ = ev.admin;
}

#[test]
fn unpaused_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    pool.pause();
    pool.unpause();
    let ev = UnpausedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    let _ = ev.admin;
}

// ---- LockPeriodAddedEvent / LockPeriodRemovedEvent ----

#[test]
fn lock_period_added_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let p: u64 = 1_209_600;
    pool.add_lock_period(&p);
    let ev = LockPeriodAddedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.period, p);
}

#[test]
fn lock_period_removed_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let p: u64 = 1_209_600;
    pool.add_lock_period(&p);
    pool.remove_lock_period(&p);
    let ev = LockPeriodRemovedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.period, p);
}

// ---- DeFindexVaultUpdatedEvent ----

#[test]
fn defindex_vault_updated_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let new_vault = Address::generate(&e);
    pool.set_defindex_vault(&new_vault);
    let ev = DeFindexVaultUpdatedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.new_vault, new_vault);
}

// ---- BlendTokenUpdatedEvent ----

#[test]
fn blend_token_updated_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let new_token = Address::generate(&e);
    pool.set_blend_token(&new_token);
    let ev = BlendTokenUpdatedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.new_token, new_token);
}

// ---- Upgrade events ----

#[test]
fn upgrade_proposed_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let hash: BytesN<32> = BytesN::random(&e);
    pool.propose_upgrade(&hash);
    let ev = UpgradeProposedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.wasm_hash, hash);
}

#[test]
fn upgrade_cancelled_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let hash: BytesN<32> = BytesN::random(&e);
    pool.propose_upgrade(&hash);
    pool.cancel_upgrade();
    let ev = UpgradeCancelledEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.wasm_hash, hash);
}

#[test]
fn upgrade_executed_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    let wasm_hash = e.deployer().upload_contract_wasm(UPGRADE_WASM);
    pool.propose_upgrade(&wasm_hash);
    e.jump_time(TIMELOCK_48H + 1);
    pool.execute_upgrade();
    let ev = UpgradeExecutedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    assert_eq!(ev.wasm_hash, wasm_hash);
    assert_eq!(ev.new_version, 2);
}

#[test]
fn upgrades_locked_event_payload() {
    let e = Env::default();
    let (_, _, _, pool, _, _) = setup(&e);
    pool.lock_upgrades_forever();
    let ev = UpgradesLockedEvent::try_from_val(&e, &last_val(&e)).unwrap();
    let _ = ev.admin;
}
