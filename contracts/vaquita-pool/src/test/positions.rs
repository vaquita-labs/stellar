#![cfg(test)]
//! Round-trip tests for the positions module.

use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
use crate::test::EnvTestUtils;
use crate::types::Position;
use crate::{positions, VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env, Vec};

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
    (alice, admin, pool, usdc_client)
}

#[test]
fn deposit_creates_position_withdraw_removes_it() {
    let e = Env::default();
    let (alice, _, pool, tok) = setup(&e);
    let amt: i128 = 100_000;
    tok.mint(&alice, &amt);
    let nonce = 1u64;
    let id = pool.compute_deposit_id(&alice, &nonce);

    pool.deposit(&alice, &nonce, &amt, &LOCK_7D);
    assert!(pool.get_position(&id).is_some());

    pool.withdraw(&alice, &nonce);
    assert!(pool.get_position(&id).is_none());
}

#[test]
fn nonce_can_be_reused_after_withdrawal() {
    let e = Env::default();
    let (alice, _, pool, tok) = setup(&e);
    let amt: i128 = 100_000;
    tok.mint(&alice, &(amt * 2));
    let nonce = 42u64;
    let id = pool.compute_deposit_id(&alice, &nonce);

    pool.deposit(&alice, &nonce, &amt, &LOCK_7D);
    pool.withdraw(&alice, &nonce);

    // Same nonce should now be allowed again
    pool.deposit(&alice, &nonce, &amt, &LOCK_7D);
    assert!(pool.get_position(&id).is_some());
}

#[test]
fn outstanding_count_tracks_open_positions() {
    let e = Env::default();
    let (alice, _, pool, tok) = setup(&e);
    let amt: i128 = 100_000;
    tok.mint(&alice, &(amt * 3));

    let id1 = pool.compute_deposit_id(&alice, &1u64);
    let id2 = pool.compute_deposit_id(&alice, &2u64);
    let id3 = pool.compute_deposit_id(&alice, &3u64);

    pool.deposit(&alice, &1u64, &amt, &LOCK_7D);
    pool.deposit(&alice, &2u64, &amt, &LOCK_7D);
    pool.deposit(&alice, &3u64, &amt, &LOCK_7D);

    assert!(pool.get_position(&id1).is_some());
    assert!(pool.get_position(&id2).is_some());
    assert!(pool.get_position(&id3).is_some());

    pool.withdraw(&alice, &1u64);
    assert!(pool.get_position(&id1).is_none());
    assert!(pool.get_position(&id2).is_some());
    assert!(pool.get_position(&id3).is_some());
}

#[test]
fn positions_helpers_cover_default_and_ttl_paths() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    e.set_default_info();

    let admin = Address::generate(&e);
    let owner = Address::generate(&e);
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let token = usdc.address();
    let vault = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );
    let lp: Vec<u64> = Vec::from_array(&e, [LOCK_7D]);
    let contract = e.register(
        VaquitaPool,
        (admin, usdc.address(), vault, lp, 0i128, 172800u64),
    );
    let id: BytesN<32> = BytesN::from_array(&e, &[9u8; 32]);

    e.as_contract(&contract, || {
        assert_eq!(positions::outstanding_count(&e), 0);
        assert_eq!(positions::outstanding_count_for_period(&e, LOCK_7D), 0);
        assert!(!positions::exists(&e, &id));

        positions::extend_ttl(&e, &id);
        positions::remove(&e, &id, LOCK_7D);
        assert_eq!(positions::outstanding_count(&e), 0);
        assert_eq!(positions::outstanding_count_for_period(&e, LOCK_7D), 0);

        let position = Position {
            owner,
            token,
            amount: 123,
            shares: 120,
            finalization_time: 456,
            lock_period: LOCK_7D,
        };
        positions::set(&e, &id, &position);
        assert!(positions::exists(&e, &id));
        assert_eq!(positions::outstanding_count(&e), 1);
        assert_eq!(positions::outstanding_count_for_period(&e, LOCK_7D), 1);

        positions::extend_ttl(&e, &id);
        positions::remove(&e, &id, LOCK_7D);
        assert!(!positions::exists(&e, &id));
        assert_eq!(positions::outstanding_count(&e), 0);
        assert_eq!(positions::outstanding_count_for_period(&e, LOCK_7D), 0);
    });
}
