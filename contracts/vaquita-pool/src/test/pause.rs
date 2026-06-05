#![cfg(test)]

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

const LOCK_7D: u64 = 604_800;

fn setup(e: &Env) -> (Address, Address, VaquitaPoolClient<'_>, MockTokenClient<'_>) {
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
    e.set_default_info();

    let admin = Address::generate(e);
    let alice = Address::generate(e);

    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let usdc_client = MockTokenClient::new(e, &usdc.address());

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
    (admin, alice, pool, usdc_client)
}

// ---- Cycle 1: pause/unpause round-trip ----

#[test]
fn pause_unpause_round_trip() {
    let e = Env::default();
    let (_, _, pool, _) = setup(&e);

    assert!(!pool.is_paused());
    pool.pause();
    assert!(pool.is_paused());
    pool.unpause();
    assert!(!pool.is_paused());
}

// ---- Cycle 2: deposit rejected while paused ----

#[test]
fn deposit_rejected_while_paused() {
    let e = Env::default();
    let (_, alice, pool, tok) = setup(&e);

    tok.mint(&alice, &100i128);
    pool.pause();

    let result = pool.try_deposit(&alice, &String::from_str(&e, "D1"), &100i128, &LOCK_7D);
    assert_eq!(result, Err(Ok(VaquitaPoolError::Paused)));
}

// ---- Cycle 3: withdraw succeeds while paused ----

#[test]
fn withdraw_succeeds_while_paused() {
    let e = Env::default();
    let (_, alice, pool, tok) = setup(&e);

    let amt: i128 = 100_000;
    tok.mint(&alice, &amt);
    let id = String::from_str(&e, "W1");
    pool.deposit(&alice, &id, &amt, &LOCK_7D);

    pool.pause();
    // Withdraw must succeed even while paused
    pool.withdraw(&alice, &id);
    assert!(pool.get_position(&id).is_none());
}

// ---- Cycle 4: non-admin cannot pause ----

#[test]
fn non_admin_cannot_pause() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    e.set_default_info();

    let admin = Address::generate(&e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let vault = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let lp: Vec<u64> = Vec::from_array(&e, [LOCK_7D]);
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
    let pool = VaquitaPoolClient::new(&e, &pool_id);
    // No mock_all_auths — require_auth on admin will fail
    let result = pool.try_pause();
    assert!(result.is_err());
}

// ---- Cycle 5: double-pause is idempotent ----

#[test]
fn double_pause_is_idempotent() {
    let e = Env::default();
    let (_, _, pool, _) = setup(&e);

    pool.pause();
    pool.pause(); // second pause must not error
    assert!(pool.is_paused());
}

// ---- Cycle 6: remove_lock_period success ----

#[test]
fn remove_lock_period_success() {
    let e = Env::default();
    let (_, _, pool, _) = setup(&e);

    pool.add_lock_period(&86400u64); // add a new period with no deposits
    pool.remove_lock_period(&86400u64);
    // Verify the period is gone: try to deposit into it → should fail
    let result = pool.try_deposit(
        &Address::generate(&e),
        &String::from_str(&e, "X"),
        &1i128,
        &86400u64,
    );
    assert_eq!(result, Err(Ok(VaquitaPoolError::InvalidPeriod)));
}

// ---- Cycle 7: remove_lock_period blocked with live positions ----

#[test]
fn remove_lock_period_blocked_with_positions() {
    let e = Env::default();
    let (_, alice, pool, tok) = setup(&e);

    let amt: i128 = 100_000;
    tok.mint(&alice, &amt);
    pool.deposit(&alice, &String::from_str(&e, "P1"), &amt, &LOCK_7D);

    let result = pool.try_remove_lock_period(&LOCK_7D);
    assert_eq!(result, Err(Ok(VaquitaPoolError::LockPeriodHasPositions)));
}

// ---- Cycle 8: remove_lock_period sweeps reward pool to protocol fees ----

#[test]
fn remove_lock_period_sweeps_reward_pool() {
    let e = Env::default();
    let (admin, alice, pool, tok) = setup(&e);

    // Deposit then withdraw early so reward_pool has funds
    let amt: i128 = 100_000_0000;
    tok.mint(&alice, &amt);
    pool.update_early_withdrawal_fee(&500i128); // 5%
    pool.deposit(&alice, &String::from_str(&e, "S1"), &amt, &LOCK_7D);

    e.jump_time(LOCK_7D / 2); // early-withdraw window
    pool.withdraw(&alice, &String::from_str(&e, "S1"));

    // Now reward_pool for LOCK_7D should be nonzero if interest > 0.
    // Since vault returns no yield in mock by default, interest = 0 and reward_pool = 0.
    // Add rewards manually instead.
    let reward: i128 = 50_000;
    tok.mint(&admin, &(reward + amt)); // admin needs extra tokens
    tok.mint(&alice, &amt);
    // Need a deposit so add_rewards validates total_deposits > 0
    pool.deposit(&alice, &String::from_str(&e, "S2"), &amt, &LOCK_7D);
    pool.add_rewards(&LOCK_7D, &reward);

    // Verify reward_pool is seeded
    let pd_before = pool.get_period_data(&LOCK_7D).expect("period");
    assert!(pd_before.reward_pool > 0);

    // Now withdraw the deposit so position count = 0
    pool.withdraw(&alice, &String::from_str(&e, "S2"));

    // remove_lock_period should sweep reward_pool into ProtocolFees
    pool.remove_lock_period(&LOCK_7D);

    // LOCK_7D is gone — depositing into it fails
    let gone = pool.try_deposit(&alice, &String::from_str(&e, "after"), &1i128, &LOCK_7D);
    assert_eq!(gone, Err(Ok(VaquitaPoolError::InvalidPeriod)));

    // Protocol fees increased by the swept reward pool
    // Withdraw protocol fees — admin should receive them
    let admin_before = tok.balance(&admin);
    pool.withdraw_protocol_fees();
    let admin_after = tok.balance(&admin);
    assert!(
        admin_after > admin_before,
        "swept reward pool should appear in protocol fees"
    );
}

// ---- Cycle 9: remove_lock_period rejects unknown period ----

#[test]
fn remove_lock_period_unknown_period() {
    let e = Env::default();
    let (_, _, pool, _) = setup(&e);

    let result = pool.try_remove_lock_period(&999_999u64);
    assert_eq!(result, Err(Ok(VaquitaPoolError::LockPeriodNotSupported)));
}
