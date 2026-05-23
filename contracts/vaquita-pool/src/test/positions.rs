#![cfg(test)]
//! Round-trip tests for the positions module.

use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

const LOCK_7D: u64 = 604800;

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
    let pool_id = e.register(VaquitaPool, ());
    let pool = VaquitaPoolClient::new(e, &pool_id);
    pool.initialize(&admin, &usdc.address(), &vault, &lp);
    (alice, admin, pool, usdc_client)
}

#[test]
fn deposit_creates_position_withdraw_removes_it() {
    let e = Env::default();
    let (alice, _, pool, tok) = setup(&e);
    let amt: i128 = 100_000;
    tok.mint(&alice, &amt);
    let id = String::from_str(&e, "D1");

    pool.deposit(&alice, &id, &amt, &LOCK_7D);
    assert!(pool.get_position(&id).is_some());

    pool.withdraw(&alice, &id);
    assert!(pool.get_position(&id).is_none());
}

#[test]
fn deposit_id_can_be_reused_after_withdrawal() {
    let e = Env::default();
    let (alice, _, pool, tok) = setup(&e);
    let amt: i128 = 100_000;
    tok.mint(&alice, &(amt * 2));
    let id = String::from_str(&e, "reuse");

    pool.deposit(&alice, &id, &amt, &LOCK_7D);
    pool.withdraw(&alice, &id);

    // Same id should now be allowed again
    pool.deposit(&alice, &id, &amt, &LOCK_7D);
    assert!(pool.get_position(&id).is_some());
}

#[test]
fn outstanding_count_tracks_open_positions() {
    let e = Env::default();
    let (alice, _, pool, tok) = setup(&e);
    let amt: i128 = 100_000;
    tok.mint(&alice, &(amt * 3));

    let id1 = String::from_str(&e, "c1");
    let id2 = String::from_str(&e, "c2");
    let id3 = String::from_str(&e, "c3");

    pool.deposit(&alice, &id1, &amt, &LOCK_7D);
    pool.deposit(&alice, &id2, &amt, &LOCK_7D);
    pool.deposit(&alice, &id3, &amt, &LOCK_7D);

    // Verify positions exist
    assert!(pool.get_position(&id1).is_some());
    assert!(pool.get_position(&id2).is_some());
    assert!(pool.get_position(&id3).is_some());

    pool.withdraw(&alice, &id1);
    assert!(pool.get_position(&id1).is_none());
    assert!(pool.get_position(&id2).is_some());
    assert!(pool.get_position(&id3).is_some());
}
