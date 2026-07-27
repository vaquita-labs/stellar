#![cfg(test)]
//! Tests for the safe security-hardening guards (S2, D3) and the P1 lock cap.

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient, MAX_LOCK_PERIOD_SECS};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, Vec};

const LOCK_7D: u64 = 604_800;

fn setup(
    e: &Env,
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
            0i128,
            172800u64,
        ),
    );
    let pool = VaquitaPoolClient::new(e, &pool_id);
    (admin, alice, pool, vault, usdc_client)
}

// ---- P1: lock-period cap ----

#[test]
fn add_lock_period_rejects_over_max() {
    let e = Env::default();
    let (_, _, pool, _vault, _tok) = setup(&e);

    let result = pool.try_add_lock_period(&(MAX_LOCK_PERIOD_SECS + 1));
    assert_eq!(result, Err(Ok(VaquitaPoolError::LockPeriodExceedsMax)));

    // Zero is also rejected.
    let zero = pool.try_add_lock_period(&0u64);
    assert_eq!(zero, Err(Ok(VaquitaPoolError::LockPeriodExceedsMax)));
}

#[test]
fn add_lock_period_accepts_at_max() {
    let e = Env::default();
    let (_, _, pool, _vault, _tok) = setup(&e);
    pool.add_lock_period(&MAX_LOCK_PERIOD_SECS); // must succeed
}

#[test]
fn deposit_normal_period_succeeds() {
    let e = Env::default();
    let (_, alice, pool, _vault, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &1u64, &100_000i128, &LOCK_7D);
}

// ---- S2: withdraw_from_vault checked vector access ----

#[test]
fn withdraw_reverts_when_vault_preview_is_empty() {
    let e = Env::default();
    let (_, alice, pool, vault, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &1u64, &100_000i128, &LOCK_7D);

    // Malicious/broken vault returns an empty preview vector.
    vault.test_set_empty_preview(&true);

    let result = pool.try_withdraw(&alice, &1u64);
    assert_eq!(result, Err(Ok(VaquitaPoolError::VaultReturnedNoAmounts)));
}

#[test]
fn withdraw_reverts_when_vault_withdraw_is_empty() {
    let e = Env::default();
    let (_, alice, pool, vault, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &1u64, &100_000i128, &LOCK_7D);

    // Preview is fine, but the withdraw call returns an empty vector.
    vault.test_set_empty_withdraw(&true);

    let result = pool.try_withdraw(&alice, &1u64);
    assert_eq!(result, Err(Ok(VaquitaPoolError::VaultReturnedNoAmounts)));
}

// ---- D3: vault replay / over-pull guard ----

#[test]
fn deposit_reverts_when_vault_pulls_more_than_amount() {
    let e = Env::default();
    let (_, alice, pool, vault, tok) = setup(&e);

    let pool_addr = pool.address.clone();
    let amount: i128 = 100_000;

    // The pool already holds some BLEND (e.g. an existing reward pool) that a
    // replayed transfer would try to drain.
    tok.mint(&pool_addr, &50_000i128);
    // Vault will pull an extra 50_000 beyond the authorized `amount`.
    vault.test_set_extra_pull(&50_000i128);

    tok.mint(&alice, &amount);
    let result = pool.try_deposit(&alice, &1u64, &amount, &LOCK_7D);
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::VaultPulledUnexpectedAmount))
    );
}

#[test]
fn deposit_succeeds_when_vault_pulls_exactly_amount() {
    let e = Env::default();
    let (_, alice, pool, _vault, tok) = setup(&e);

    // Sanity: the balance-delta guard must not reject a well-behaved vault.
    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &2u64, &100_000i128, &LOCK_7D);
}
