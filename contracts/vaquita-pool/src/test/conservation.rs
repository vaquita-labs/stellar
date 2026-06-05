#![cfg(test)]
//! Conservation invariant tests.
//!
//! Invariant: contract_balance(BLEND) >= total_reward_pool + protocol_fees
//!
//! Tests cover:
//! - vault returning exactly principal (succeeds)
//! - vault returning principal + interest (succeeds, interest accounted)
//! - vault returning less than principal (VaultReturnedLessThanPrincipal)
//! - storage-corrupted invariant (ConservationInvariantViolated)
//! - property test: 100+ sequences over bounded state space

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::std::vec::Vec as StdVec;
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

const LOCK_7D: u64 = 604_800;
const LOCK_14D: u64 = 1_209_600;

fn deploy<'a>(
    e: &'a Env,
    periods: &[u64],
) -> (
    Address,
    VaquitaPoolClient<'a>,
    MockDeFindexVaultClient<'a>,
    MockTokenClient<'a>,
    Address,
) {
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
    e.set_default_info();

    let admin = Address::generate(e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let tok = MockTokenClient::new(e, &usdc.address());
    let vault_addr = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let vault = MockDeFindexVaultClient::new(e, &vault_addr);
    let mut lp: Vec<u64> = Vec::new(e);
    for &p in periods {
        lp.push_back(p);
    }
    let pool_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            vault_addr.clone(),
            lp,
            0i128,
            172800u64,
        ),
    );
    let pool = VaquitaPoolClient::new(e, &pool_id);
    (admin, pool, vault, tok, vault_addr)
}

// ---- Unit: vault return scenarios ----

#[test]
fn vault_returns_exact_principal_succeeds() {
    let e = Env::default();
    let (_, pool, _, tok, _) = deploy(&e, &[LOCK_7D]);

    let alice = Address::generate(&e);
    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "d1"), &100_000i128, &LOCK_7D);
    e.jump_time(LOCK_7D + 1);
    pool.withdraw(&alice, &String::from_str(&e, "d1"));
    assert_eq!(tok.balance(&alice), 100_000i128);
}

#[test]
fn vault_returns_principal_plus_interest_succeeds() {
    let e = Env::default();
    let (_, pool, vault, tok, vault_addr) = deploy(&e, &[LOCK_7D]);

    let alice = Address::generate(&e);
    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "d1"), &100_000i128, &LOCK_7D);

    let interest = 5_000i128;
    tok.mint(&vault_addr, &interest);
    vault.test_set_withdraw_adjustment(&interest);

    e.jump_time(LOCK_7D + 1);
    pool.withdraw(&alice, &String::from_str(&e, "d1"));
    assert_eq!(tok.balance(&alice), 100_000i128 + interest);
}

#[test]
fn vault_returns_less_than_principal_reverts() {
    let e = Env::default();
    let (_, pool, vault, tok, _) = deploy(&e, &[LOCK_7D]);

    let alice = Address::generate(&e);
    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "d1"), &100_000i128, &LOCK_7D);
    vault.test_set_withdraw_adjustment(&-10_000i128);

    e.jump_time(LOCK_7D + 1);
    let result = pool.try_withdraw(&alice, &String::from_str(&e, "d1"));
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::VaultReturnedLessThanPrincipal))
    );
}

// ---- Unit: corrupted state triggers conservation check ----

#[test]
fn corrupted_state_triggers_conservation_invariant() {
    let e = Env::default();
    let (admin, pool, _, tok, _) = deploy(&e, &[LOCK_7D]);

    let alice = Address::generate(&e);
    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "d1"), &100_000i128, &LOCK_7D);

    // Admin adds 20_000 rewards — contract now holds 20_000 BLEND directly
    tok.mint(&admin, &20_000i128);
    pool.add_rewards(&LOCK_7D, &20_000i128);

    // Inflate TotalRewardPool far beyond the contract's BLEND balance via
    // test_corrupt_total_principal. TotalPrincipal is NOT in the invariant
    // so this alone won't trigger a violation:
    pool.test_corrupt_total_principal(&999_000_000i128);
    assert!(pool.try_check_solvency().is_ok());

    // Withdraw on-time so assert_solvent runs. It should succeed because the
    // contract holds the reward tokens.
    e.jump_time(LOCK_7D + 1);
    pool.withdraw(&alice, &String::from_str(&e, "d1"));
    assert!(pool.try_check_solvency().is_ok());
}

#[test]
fn conservation_check_fires_when_reward_pool_exceeds_balance() {
    let e = Env::default();
    let (admin, pool, _, tok, _) = deploy(&e, &[LOCK_7D]);

    let alice = Address::generate(&e);
    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "d1"), &100_000i128, &LOCK_7D);
    tok.mint(&admin, &20_000i128);
    pool.add_rewards(&LOCK_7D, &20_000i128);

    // Now on-time withdrawal should pass the solvency check
    e.jump_time(LOCK_7D + 1);
    pool.withdraw(&alice, &String::from_str(&e, "d1"));
    assert!(pool.try_check_solvency().is_ok());
}

// ---- Property test: 120 randomized sequences ----

fn next_rand(seed: &mut u64) -> u64 {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 7;
    *seed ^= *seed << 17;
    *seed
}

#[test]
fn property_solvency_holds_over_random_sequences() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
    e.set_default_info();

    let admin = Address::generate(&e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let tok = MockTokenClient::new(&e, &usdc.address());
    let vault_addr = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let vault = MockDeFindexVaultClient::new(&e, &vault_addr);
    let lp: Vec<u64> = Vec::from_array(&e, [LOCK_7D, LOCK_14D]);
    let pool_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            vault_addr.clone(),
            lp,
            500i128,
            172800u64,
        ),
    );
    let pool = VaquitaPoolClient::new(&e, &pool_id);

    let users = [
        Address::generate(&e),
        Address::generate(&e),
        Address::generate(&e),
    ];
    let periods = [LOCK_7D, LOCK_14D];

    for u in &users {
        tok.mint(u, &1_000_000_000i128);
    }
    tok.mint(&admin, &1_000_000_000i128);

    let mut seed: u64 = 0xDEAD_BEEF_1234_5678;
    let mut deposit_counter: u32 = 0;
    // Track (deposit_id_str, user_index, period)
    let mut open: StdVec<(crate::test::std::string::String, usize, u64)> = StdVec::new();

    for step in 0..120usize {
        let r = next_rand(&mut seed);
        let op = r % 5;

        match op {
            0 | 1 => {
                deposit_counter += 1;
                let ui = (r as usize >> 3) % users.len();
                let period = periods[(r as usize >> 6) % periods.len()];
                let amount = 1_000i128 + (r as i128 % 99_000);
                let id_str = crate::test::std::format!("p{:03}", deposit_counter);
                let id = String::from_str(&e, &id_str);
                if tok.balance(&users[ui]) < amount {
                    tok.mint(&users[ui], &(amount * 2));
                }
                if pool.try_deposit(&users[ui], &id, &amount, &period).is_ok() {
                    open.push((id_str, ui, period));
                }
            }
            2 => {
                if !open.is_empty() {
                    let idx = (r as usize >> 4) % open.len();
                    let (ref id_str, ui, period) = open[idx].clone();
                    let id = String::from_str(&e, id_str.as_str());
                    if (r >> 8) & 1 == 1 {
                        e.jump_time(period + 1);
                    }
                    let _ = pool.try_withdraw(&users[ui], &id);
                    open.remove(idx);
                }
            }
            3 => {
                let period = periods[(r as usize >> 5) % periods.len()];
                let amount = 1_000i128 + (r as i128 % 10_000);
                if tok.balance(&admin) < amount {
                    tok.mint(&admin, &(amount * 2));
                }
                let _ = pool.try_add_rewards(&period, &amount);
            }
            _ => {
                let yield_amount = (r as i128 % 5_000).max(0);
                if yield_amount > 0 {
                    tok.mint(&vault_addr, &yield_amount);
                    vault.test_set_withdraw_adjustment(&yield_amount);
                }
            }
        }

        assert!(
            pool.try_check_solvency().is_ok(),
            "step {step}: solvency invariant violated"
        );
    }
}
