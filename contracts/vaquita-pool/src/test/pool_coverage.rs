#![cfg(test)]
//! Branch coverage for `VaquitaPool` (admin flows, rewards, early withdraw fees, views).

use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::{assert_approx_eq_rel, EnvTestUtils};
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
    let pool_id = e.register(VaquitaPool, ());
    let pool = VaquitaPoolClient::new(e, &pool_id);
    pool.initialize(&admin, &usdc.address(), &defindex_vault_address, &lock_periods);

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

    pool.add_lock_period(&admin, &LOCK_14D);

    let p2 = String::from_str(&e, "B1");
    tok.mint(&alice, &(principal * 2));
    pool.deposit(&alice, &p2, &principal, &LOCK_14D);

    let p14 = pool.get_period_data(&LOCK_14D).expect("period 14d");
    assert_eq!(p14.total_deposits, principal);

    let reward_amt: i128 = 50_000_0000;
    tok.mint(&admin, &reward_amt);
    pool.add_rewards(&admin, &LOCK_14D, &reward_amt);
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
    pool.add_rewards(&admin, &LOCK_7D, &reward);

    e.jump_time(LOCK_7D + 1);

    vault.test_set_withdraw_adjustment(&0);
    pool.withdraw(&alice, &da);
    // Alice should receive principal + 25% of reward pool (100/(100+300)).
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

    pool.update_early_withdrawal_fee(&admin, &2500);

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
    let fee = interest * 2500 / 10000;
    let remaining = interest - fee;
    // Early exit pays back principal only; yield is split between protocol fee and reward pool.
    assert_approx_eq_rel(tok.balance(&alice), alice_before + principal, 1);

    pool.withdraw_protocol_fees(&admin);
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
    pool.withdraw_protocol_fees(&admin);
    assert_eq!(tok.balance(&admin), admin_before);
}

#[test]
fn early_withdraw_with_zero_yield_still_hits_early_branch() {
    let e = Env::default();
    let (admin, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);
    pool.update_early_withdrawal_fee(&admin, &1000);

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
    assert!(pool
        .get_position(&String::from_str(&e, "nope"))
        .is_none());
    assert!(pool.get_period_data(&999_999u64).is_none());
}

#[test]
fn calculate_reward_returns_zero_when_no_deposits() {
    let period = Period {
        reward_pool: 1_000_0000,
        total_deposits: 0,
    };
    assert_eq!(VaquitaPool::test_calculate_reward(&period, 100_000_0000), 0);
}

#[test]
fn strategy_loss_treats_interest_as_zero() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);

    let principal: i128 = 150_000_0000;
    tok.mint(&alice, &principal);
    let dep = String::from_str(&e, "loss");
    pool.deposit(&alice, &dep, &principal, &LOCK_7D);

    let loss: i128 = -20_000_0000;
    vault.test_set_withdraw_adjustment(&loss);

    e.jump_time(LOCK_7D + 1);
    let alice_before = tok.balance(&alice);
    pool.withdraw(&alice, &dep);
    assert_approx_eq_rel(tok.balance(&alice), alice_before + principal + loss, 1);
}

#[test]
#[should_panic(expected = "Invalid amount")]
fn deposit_rejects_zero_amount() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&alice, &1i128);
    pool.deposit(
        &alice,
        &String::from_str(&e, "z"),
        &0i128,
        &LOCK_7D,
    );
}

#[test]
#[should_panic(expected = "Invalid period")]
fn deposit_rejects_unknown_period() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&alice, &100i128);
    pool.deposit(
        &alice,
        &String::from_str(&e, "x"),
        &100i128,
        &999u64,
    );
}

#[test]
#[should_panic(expected = "Already initialized")]
fn initialize_twice_panics() {
    let e = Env::default();
    let (admin, _, _, usdc, vault, pool, _, _) = deploy_pool(&e);
    let periods: Vec<u64> = Vec::from_array(&e, [LOCK_7D]);
    pool.initialize(&admin, &usdc, &vault, &periods);
}

#[test]
#[should_panic(expected = "Deposit already exists")]
fn deposit_rejects_duplicate_id() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    let id = String::from_str(&e, "dup");
    tok.mint(&alice, &200i128);
    pool.deposit(&alice, &id, &100i128, &LOCK_7D);
    pool.deposit(&alice, &id, &100i128, &LOCK_7D);
}

#[test]
#[should_panic(expected = "Not position owner")]
fn withdraw_rejects_non_owner() {
    let e = Env::default();
    let (_, alice, bob, _, _, pool, _, tok) = deploy_pool(&e);
    let id = String::from_str(&e, "own");
    tok.mint(&alice, &100i128);
    pool.deposit(&alice, &id, &100i128, &LOCK_7D);
    pool.withdraw(&bob, &id);
}

#[test]
#[should_panic(expected = "Position not found")]
fn withdraw_rejects_unknown_deposit() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&alice, &1i128);
    pool.withdraw(&alice, &String::from_str(&e, "missing"));
}

#[test]
#[should_panic(expected = "Not owner")]
fn withdraw_protocol_fees_requires_admin() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.withdraw_protocol_fees(&alice);
}

#[test]
#[should_panic(expected = "Invalid period")]
fn add_rewards_rejects_unknown_period() {
    let e = Env::default();
    let (admin, _, _, _, _, pool, _, tok) = deploy_pool(&e);
    tok.mint(&admin, &100i128);
    pool.add_rewards(&admin, &999_999u64, &100i128);
}

#[test]
#[should_panic(expected = "Invalid fee")]
fn update_fee_rejects_above_basis_points() {
    let e = Env::default();
    let (admin, _, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.update_early_withdrawal_fee(&admin, &10001i128);
}

#[test]
#[should_panic(expected = "Lock period already supported")]
fn add_lock_period_rejects_duplicate() {
    let e = Env::default();
    let (admin, _, _, _, _, pool, _, _) = deploy_pool(&e);
    pool.add_lock_period(&admin, &LOCK_14D);
    pool.add_lock_period(&admin, &LOCK_14D);
}

#[test]
#[should_panic(expected = "Vault returned zero shares")]
fn deposit_rejects_zero_vault_shares() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);
    vault.test_set_skip_share_mint(&true);
    tok.mint(&alice, &100i128);
    pool.deposit(
        &alice,
        &String::from_str(&e, "zs"),
        &100i128,
        &LOCK_7D,
    );
}

#[test]
#[should_panic(expected = "Vault share balance decreased after deposit")]
fn deposit_rejects_vault_share_drop() {
    let e = Env::default();
    let (_, alice, _, _, _, pool, vault, tok) = deploy_pool(&e);
    tok.mint(&alice, &200i128);
    pool.deposit(
        &alice,
        &String::from_str(&e, "s1"),
        &100i128,
        &LOCK_7D,
    );
    vault.test_set_steal_shares_on_deposit(&80i128);
    pool.deposit(
        &alice,
        &String::from_str(&e, "s2"),
        &50i128,
        &LOCK_7D,
    );
}
