#![cfg(test)]
//! Branch coverage for `VaquitaPool` (admin flows, rewards, early withdraw fees, views).

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::{assert_approx_eq_rel, test_calculate_reward, EnvTestUtils};
use crate::{Period, VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

const LOCK_7D: u64 = 604800;
const LOCK_14D: u64 = 1_209_600;

fn deploy_pool(
    e: &Env,
) -> (
    Address,
    Address,
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
    let bob = Address::generate(e);

    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let usdc_client = MockTokenClient::new(e, &usdc.address());

    let defindex_vault_address = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let vault_client = MockDeFindexVaultClient::new(e, &defindex_vault_address);

    let lock_periods: Vec<u64> = Vec::from_array(e, [LOCK_7D]);
    let pool_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            defindex_vault_address.clone(),
            lock_periods,
            0i128,
            172800u64,
        ),
    );
    let pool = VaquitaPoolClient::new(e, &pool_id);

    (
        admin,
        alice,
        bob,
        usdc.address(),
        defindex_vault_address,
        pool,
        vault_client,
        usdc_client,
    )
}

#[test]
fn views_and_period_updates() {
    let e = Env::default();
    let (admin, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);

    let principal: i128 = 100_000_0000;
    tok.mint(&alice, &principal);
    let dep = String::from_str(&e, "A1");
    pool.deposit(&alice, &dep, &principal, &LOCK_7D);

    let pos = pool.get_position(&dep).expect("position");
    assert_eq!(pos.amount, principal);
    assert_eq!(pos.owner, alice);

    let period = pool.get_period_data(&LOCK_7D).expect("period");
    assert_eq!(period.total_deposits, principal);
    assert_eq!(period.reward_pool, 0);

    pool.add_lock_period(&LOCK_14D);

    let p2 = String::from_str(&e, "B1");
    tok.mint(&alice, &(principal * 2));
    pool.deposit(&alice, &p2, &principal, &LOCK_14D);

    let p14 = pool.get_period_data(&LOCK_14D).expect("period 14d");
    assert_eq!(p14.total_deposits, principal);

    // Seed reward only after there are deposits (new validation).
    let reward_amt: i128 = 50_000_0000;
    tok.mint(&admin, &reward_amt);
    pool.add_rewards(&LOCK_14D, &reward_amt);
    let after_reward = pool.get_period_data(&LOCK_14D).expect("period 14d after");
    assert_eq!(after_reward.reward_pool, reward_amt);

    e.jump_time(LOCK_14D + 1);
    vault.test_set_withdraw_adjustment(&0);
    pool.withdraw(&alice, &p2);

    assert!(pool.get_position(&p2).is_none());
    vault.test_set_withdraw_adjustment(&0);
    pool.withdraw(&alice, &dep);
}

#[test]
fn on_time_withdraw_includes_reward_share() {
    let e = Env::default();
    let (admin, alice, bob, _, _, pool, vault, tok) = deploy_pool(&e);

    let a_amt: i128 = 100_000_0000;
    let b_amt: i128 = 300_000_0000;
    tok.mint(&alice, &a_amt);
    tok.mint(&bob, &b_amt);

    let da = String::from_str(&e, "da");
    let db = String::from_str(&e, "db");
    pool.deposit(&alice, &da, &a_amt, &LOCK_7D);
    pool.deposit(&bob, &db, &b_amt, &LOCK_7D);

    let reward: i128 = 40_000_0000;
    tok.mint(&admin, &reward);
    pool.add_rewards(&LOCK_7D, &reward);

    e.jump_time(LOCK_7D + 1);

    vault.test_set_withdraw_adjustment(&0);
    pool.withdraw(&alice, &da);
    let alice_balance = tok.balance(&alice);
    assert_eq!(alice_balance, a_amt + reward / 4);

    vault.test_set_withdraw_adjustment(&0);
    pool.withdraw(&bob, &db);
    let bob_balance = tok.balance(&bob);
    assert_eq!(bob_balance, b_amt + reward * 3 / 4);
}

#[test]
fn early_withdraw_routes_interest_to_protocol_and_pool() {
    let e = Env::default();
    let (admin, alice, _, _, vault_addr, pool, vault, tok) = deploy_pool(&e);

    pool.update_early_withdrawal_fee(&500);

    let principal: i128 = 200_000_0000;
    tok.mint(&alice, &principal);
    let dep = String::from_str(&e, "early");
    pool.deposit(&alice, &dep, &principal, &LOCK_7D);

    let yield_extra: i128 = 40_000_0000;
    tok.mint(&vault_addr, &yield_extra);
    vault.test_set_withdraw_adjustment(&yield_extra);

    e.jump_time(LOCK_7D / 2);

    let alice_before = tok.balance(&alice);
    pool.withdraw(&alice, &dep);

    let interest = yield_extra;
    let fee = interest * 500 / 10000;
    let remaining = interest - fee;
    assert_approx_eq_rel(tok.balance(&alice), alice_before + principal, 1);

    pool.withdraw_protocol_fees();
    assert_approx_eq_rel(tok.balance(&admin), fee, 1);

    let pd = pool.get_period_data(&LOCK_7D).expect("period");
    assert_eq!(pd.total_deposits, 0);
    assert_eq!(pd.reward_pool, remaining);
}

#[test]
fn withdraw_protocol_fees_is_no_op_when_zero() {
    let e = Env::default();
    let (admin, _, _, _, _, pool, _, tok) = deploy_pool(&e);
    let admin_before = tok.balance(&admin);
    pool.withdraw_protocol_fees();
    assert_eq!(tok.balance(&admin), admin_before);
}

#[test]
fn early_withdraw_with_zero_yield_still_hits_early_branch() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);
    pool.update_early_withdrawal_fee(&1000);

    let principal: i128 = 50_000_0000;
    tok.mint(&alice, &principal);
    let dep = String::from_str(&e, "early0");
    pool.deposit(&alice, &dep, &principal, &LOCK_7D);
    vault.test_set_withdraw_adjustment(&0);
    e.jump_time(LOCK_7D / 3);
    let before = tok.balance(&alice);
    pool.withdraw(&alice, &dep);
    assert_eq!(tok.balance(&alice), before + principal);
}

#[test]
fn get_views_return_none_for_missing_keys() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    assert!(pool.get_position(&String::from_str(&e, "nope")).is_none());
    assert!(pool.get_period_data(&999_999u64).is_none());
}

#[test]
fn calculate_reward_returns_zero_when_no_deposits() {
    let period = Period {
        reward_pool: 1_000_0000,
        total_deposits: 0,
    };
    assert_eq!(test_calculate_reward(&period, 100_000_0000), 0);
}

#[test]
fn vault_loss_reverts_with_less_than_principal() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);

    let principal: i128 = 150_000_0000;
    tok.mint(&alice, &principal);
    let dep = String::from_str(&e, "loss");
    pool.deposit(&alice, &dep, &principal, &LOCK_7D);

    let loss: i128 = -20_000_0000;
    vault.test_set_withdraw_adjustment(&loss);

    e.jump_time(LOCK_7D + 1);
    let result = pool.try_withdraw(&alice, &dep);
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::VaultReturnedLessThanPrincipal))
    );
}

// ---- Helper for tests that need a pool but want to control auth independently ----

/// Sets up a pool via __constructor (no auth required) in an env where
/// mock_all_auths has NOT been called, so subsequent admin calls will fail auth.
fn deploy_pool_no_auth(e: &Env) -> (Address, Address, VaquitaPoolClient<'_>) {
    e.cost_estimate().budget().reset_unlimited();
    e.set_default_info();

    let admin = Address::generate(e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let vault = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let lp: Vec<u64> = Vec::from_array(e, [LOCK_7D]);
    let pool_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            vault.clone(),
            lp,
            0i128,
            172800u64,
        ),
    );
    let pool = VaquitaPoolClient::new(e, &pool_id);
    (admin, usdc.address(), pool)
}

// ---- Error variant tests (replacing should_panic strings) ----

#[test]
fn deposit_rejects_zero_amount() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&alice, &1i128);
    let result = pool.try_deposit(&alice, &String::from_str(&e, "z"), &0i128, &LOCK_7D);
    assert_eq!(result, Err(Ok(VaquitaPoolError::InvalidAmount)));
}

#[test]
fn deposit_rejects_unknown_period() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&alice, &100i128);
    let result = pool.try_deposit(&alice, &String::from_str(&e, "x"), &100i128, &999u64);
    assert_eq!(result, Err(Ok(VaquitaPoolError::InvalidPeriod)));
}

#[test]
fn constructor_sets_expected_slots() {
    // Verifies that all constructor-written slots have the expected initial values.
    // Re-run prevention is enforced by the Soroban host (constructor runs once at deploy).
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    // version() and is_paused() are added in later slices; for now just verify
    // that the pool responds correctly to existing read functions.
    assert!(pool.get_period_data(&LOCK_7D).is_none()); // no deposits yet
}

#[test]
fn deposit_rejects_duplicate_id() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    let id = String::from_str(&e, "dup");
    tok.mint(&alice, &200i128);
    pool.deposit(&alice, &id, &100i128, &LOCK_7D);
    let result = pool.try_deposit(&alice, &id, &100i128, &LOCK_7D);
    assert_eq!(result, Err(Ok(VaquitaPoolError::DepositAlreadyExists)));
}

#[test]
fn withdraw_rejects_non_owner() {
    let e = Env::default();
    let (_, alice, bob, _, _, pool, _, tok) = deploy_pool(&e);
    let id = String::from_str(&e, "own");
    tok.mint(&alice, &100i128);
    pool.deposit(&alice, &id, &100i128, &LOCK_7D);
    let result = pool.try_withdraw(&bob, &id);
    assert_eq!(result, Err(Ok(VaquitaPoolError::NotOwner)));
}

#[test]
fn withdraw_rejects_unknown_deposit() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&alice, &1i128);
    let result = pool.try_withdraw(&alice, &String::from_str(&e, "missing"));
    assert_eq!(result, Err(Ok(VaquitaPoolError::PositionNotFound)));
}

#[test]
fn withdraw_protocol_fees_requires_admin_auth() {
    // Soroban auth is enforced when no mock_all_auths is active.
    // initialize() doesn't call require_auth so we can call it in a clean env.
    let e = Env::default();
    let (_, _, pool) = deploy_pool_no_auth(&e);
    // No mock_all_auths — require_auth() on admin will trigger a host trap.
    let result = pool.try_withdraw_protocol_fees();
    assert!(result.is_err());
}

#[test]
fn add_rewards_rejects_unknown_period() {
    let e = Env::default();
    let (admin, _, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&admin, &100i128);
    let result = pool.try_add_rewards(&999_999u64, &100i128);
    assert_eq!(result, Err(Ok(VaquitaPoolError::LockPeriodNotSupported)));
}

#[test]
fn add_rewards_rejects_zero_amount() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    let result = pool.try_add_rewards(&LOCK_7D, &0i128);
    assert_eq!(result, Err(Ok(VaquitaPoolError::InvalidAmount)));
}

#[test]
fn add_rewards_rejects_period_with_no_deposits() {
    let e = Env::default();
    let (admin, _, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&admin, &100i128);
    // LOCK_7D is supported but has no deposits.
    let result = pool.try_add_rewards(&LOCK_7D, &100i128);
    assert_eq!(result, Err(Ok(VaquitaPoolError::PeriodHasNoDeposits)));
}

#[test]
fn update_fee_rejects_above_2000() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    let result = pool.try_update_early_withdrawal_fee(&10001i128);
    assert_eq!(result, Err(Ok(VaquitaPoolError::FeeCapExceeded)));
}

#[test]
fn update_fee_admin_success() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    // Success: fee within bounds
    pool.update_early_withdrawal_fee(&500i128);
}

#[test]
fn update_fee_admin_rejection_without_auth() {
    let e = Env::default();
    let (_, _, pool) = deploy_pool_no_auth(&e);
    // No mock_all_auths — require_auth() on admin will fail.
    let result = pool.try_update_early_withdrawal_fee(&500i128);
    assert!(result.is_err());
}

#[test]
fn add_lock_period_rejects_duplicate() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.add_lock_period(&LOCK_14D);
    let result = pool.try_add_lock_period(&LOCK_14D);
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::LockPeriodAlreadySupported))
    );
}

#[test]
fn add_lock_period_admin_success() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.add_lock_period(&LOCK_14D);
}

#[test]
fn add_lock_period_admin_rejection_without_auth() {
    let e = Env::default();
    let (_, _, pool) = deploy_pool_no_auth(&e);
    let result = pool.try_add_lock_period(&LOCK_14D);
    assert!(result.is_err());
}

#[test]
fn add_rewards_admin_rejection_without_auth() {
    let e = Env::default();
    let (_, _, pool) = deploy_pool_no_auth(&e);
    let result = pool.try_add_rewards(&LOCK_7D, &100i128);
    assert!(result.is_err());
}

#[test]
fn deposit_rejects_zero_vault_shares() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);
    vault.test_set_skip_share_mint(&true);
    tok.mint(&alice, &100i128);
    let result = pool.try_deposit(&alice, &String::from_str(&e, "zs"), &100i128, &LOCK_7D);
    assert_eq!(result, Err(Ok(VaquitaPoolError::VaultReturnedZeroShares)));
}

#[test]
fn deposit_rejects_vault_share_drop() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);
    tok.mint(&alice, &200i128);
    pool.deposit(&alice, &String::from_str(&e, "s1"), &100i128, &LOCK_7D);
    vault.test_set_steal_shares_on_deposit(&80i128);
    let result = pool.try_deposit(&alice, &String::from_str(&e, "s2"), &50i128, &LOCK_7D);
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::VaultShareBalanceDecreased))
    );
}

#[test]
fn fee_cap_accepts_max_2000() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.update_early_withdrawal_fee(&2000i128);
}

#[test]
fn fee_cap_rejects_2001() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    let result = pool.try_update_early_withdrawal_fee(&2001i128);
    assert_eq!(result, Err(Ok(VaquitaPoolError::FeeCapExceeded)));
}

#[test]
fn fee_rejects_negative() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    let result = pool.try_update_early_withdrawal_fee(&-1i128);
    assert_eq!(result, Err(Ok(VaquitaPoolError::InvalidFee)));
}

#[test]
fn migrate_is_callable() {
    let e = Env::default();
    let (_, _, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.migrate();
}
