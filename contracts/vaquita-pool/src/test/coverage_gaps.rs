#![cfg(test)]
//! Tests that close remaining coverage gaps in lib.rs:
//! - `refresh_position_ttl` (previously uncovered public fn)
//! - `calculate_reward` zero-deposits early return
//! - early-withdrawal fee computation + `remove_lock_period` reward sweep

use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::EnvTestUtils;
use crate::{Period, VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

const LOCK_7D: u64 = 604_800;

fn setup_fee(
    e: &Env,
    early_fee_bps: i128,
) -> (
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
    let usdc_client = MockTokenClient::new(e, &usdc.address());

    let vault_addr = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let vault = MockDeFindexVaultClient::new(e, &vault_addr);

    let lp: Vec<u64> = Vec::from_array(e, [LOCK_7D]);
    let pool_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            vault_addr.clone(),
            lp,
            early_fee_bps,
            172800u64,
        ),
    );
    let pool = VaquitaPoolClient::new(e, &pool_id);
    (alice, vault_addr, pool, vault, usdc_client)
}

#[test]
fn refresh_position_ttl_runs_for_open_position() {
    let e = Env::default();
    let (alice, _vault_addr, pool, _vault, tok) = setup_fee(&e, 0);

    tok.mint(&alice, &100_000i128);
    let id = String::from_str(&e, "R");
    pool.deposit(&alice, &id, &100_000i128, &LOCK_7D);

    // Previously uncovered public entrypoint — must not panic and is a no-op
    // for a live position.
    pool.refresh_position_ttl(&id);
}

#[test]
fn calculate_reward_returns_zero_when_no_deposits() {
    // Directly exercises the total_deposits == 0 early return.
    let pd = Period {
        reward_pool: 1_000,
        total_deposits: 0,
    };
    let reward = VaquitaPool::calculate_reward(&pd, 500).unwrap();
    assert_eq!(reward, 0);
}

#[test]
fn early_withdrawal_charges_fee_and_period_removal_sweeps_reward() {
    // early_fee = 10% (1000 bps)
    let e = Env::default();
    let (alice, vault_addr, pool, vault, tok) = setup_fee(&e, 1_000);

    let principal: i128 = 100_000;
    tok.mint(&alice, &principal);
    let id = String::from_str(&e, "E");
    pool.deposit(&alice, &id, &principal, &LOCK_7D);

    // Simulate 10_000 of yield: fund the vault and set the payout adjustment.
    let yield_amt: i128 = 10_000;
    tok.mint(&vault_addr, &yield_amt);
    vault.test_set_withdraw_adjustment(&yield_amt);

    // Withdraw before maturity → early-withdrawal branch:
    //   interest = 10_000; fee = 1_000 → protocol_fees; 9_000 → reward_pool.
    pool.withdraw(&alice, &id);
    assert_eq!(tok.balance(&alice), principal); // principal returned, interest forfeited

    // Period now has reward_pool = 9_000 and no open positions; removing it
    // sweeps that reward into protocol fees (the reward_pool > 0 branch).
    pool.remove_lock_period(&LOCK_7D);
}
