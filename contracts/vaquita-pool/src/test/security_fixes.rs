#![cfg(test)]
//! Tests for the safe security-hardening guards (checklist S1, S2).

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{
    MockDeFindexVault, MockDeFindexVaultArgs, MockDeFindexVaultClient,
};
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

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

// ---- S1: finalization_time overflow ----

#[test]
fn deposit_with_overflowing_period_reverts() {
    let e = Env::default();
    let (_, alice, pool, _vault, tok) = setup(&e);

    // A supported but absurd lock period makes `timestamp + period` wrap u64.
    let huge = u64::MAX;
    pool.add_lock_period(&huge);

    tok.mint(&alice, &100_000i128);
    let result = pool.try_deposit(&alice, &String::from_str(&e, "OF"), &100_000i128, &huge);
    assert_eq!(result, Err(Ok(VaquitaPoolError::ArithmeticOverflow)));
}

#[test]
fn deposit_with_normal_period_still_succeeds() {
    let e = Env::default();
    let (_, alice, pool, _vault, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    // Sanity: the checked_add change must not regress the normal path.
    pool.deposit(&alice, &String::from_str(&e, "OK"), &100_000i128, &LOCK_7D);
}

// ---- S2: withdraw_from_vault checked vector access ----

#[test]
fn withdraw_reverts_when_vault_preview_is_empty() {
    let e = Env::default();
    let (_, alice, pool, vault, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    let id = String::from_str(&e, "P");
    pool.deposit(&alice, &id, &100_000i128, &LOCK_7D);

    // Malicious/broken vault returns an empty preview vector.
    vault.test_set_empty_preview(&true);

    let result = pool.try_withdraw(&alice, &id);
    assert_eq!(result, Err(Ok(VaquitaPoolError::VaultReturnedNoAmounts)));
}

#[test]
fn withdraw_reverts_when_vault_withdraw_is_empty() {
    let e = Env::default();
    let (_, alice, pool, vault, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    let id = String::from_str(&e, "W");
    pool.deposit(&alice, &id, &100_000i128, &LOCK_7D);

    // Preview is fine, but the withdraw call returns an empty vector.
    vault.test_set_empty_withdraw(&true);

    let result = pool.try_withdraw(&alice, &id);
    assert_eq!(result, Err(Ok(VaquitaPoolError::VaultReturnedNoAmounts)));
}
