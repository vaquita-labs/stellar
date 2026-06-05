#![cfg(test)]

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
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
    Address,
    VaquitaPoolClient<'_>,
    MockTokenClient<'_>,
) {
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
    (admin, alice, vault, pool, usdc_client)
}

// ---- set_defindex_vault ----

#[test]
fn set_defindex_vault_blocked_with_positions() {
    let e = Env::default();
    let (_, alice, _, pool, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "D1"), &100_000i128, &LOCK_7D);

    let new_vault = Address::generate(&e);
    let result = pool.try_set_defindex_vault(&new_vault);
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::VaultRepointHasOutstandingPositions))
    );
}

#[test]
fn set_defindex_vault_succeeds_after_withdrawal() {
    let e = Env::default();
    let (_, alice, _, pool, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    let id = String::from_str(&e, "D1");
    pool.deposit(&alice, &id, &100_000i128, &LOCK_7D);
    pool.withdraw(&alice, &id);

    let new_vault = Address::generate(&e);
    pool.set_defindex_vault(&new_vault); // must succeed
}

#[test]
fn set_defindex_vault_non_admin_rejected() {
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
    // No mock_all_auths — require_owner will fail
    let new_vault = Address::generate(&e);
    let result = pool.try_set_defindex_vault(&new_vault);
    assert!(result.is_err());
}

// ---- set_blend_token ----

#[test]
fn set_blend_token_blocked_with_positions() {
    let e = Env::default();
    let (_, alice, _, pool, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    pool.deposit(&alice, &String::from_str(&e, "D2"), &100_000i128, &LOCK_7D);

    let new_token = Address::generate(&e);
    let result = pool.try_set_blend_token(&new_token);
    assert_eq!(
        result,
        Err(Ok(VaquitaPoolError::TokenRepointHasOutstandingPositions))
    );
}

#[test]
fn set_blend_token_succeeds_after_withdrawal() {
    let e = Env::default();
    let (_, alice, _, pool, tok) = setup(&e);

    tok.mint(&alice, &100_000i128);
    let id = String::from_str(&e, "D2");
    pool.deposit(&alice, &id, &100_000i128, &LOCK_7D);
    pool.withdraw(&alice, &id);

    let new_token = Address::generate(&e);
    pool.set_blend_token(&new_token); // must succeed
}

#[test]
fn set_blend_token_non_admin_rejected() {
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
    let new_token = Address::generate(&e);
    let result = pool.try_set_blend_token(&new_token);
    assert!(result.is_err());
}
