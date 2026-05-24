#![cfg(test)]

use crate::error::VaquitaPoolError;
use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
use crate::test::EnvTestUtils;
use crate::{VaquitaPool, VaquitaPoolClient};
use soroban_sdk::testutils::{Address as _, BytesN as _};
use soroban_sdk::{Address, BytesN, Env, Vec};

const LOCK_7D: u64 = 604_800;
const TIMELOCK_48H: u64 = 172_800;

fn deploy(e: &Env) -> (Address, VaquitaPoolClient<'_>) {
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
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
            TIMELOCK_48H,
        ),
    );
    let pool = VaquitaPoolClient::new(e, &pool_id);
    (admin, pool)
}

fn random_hash(e: &Env) -> BytesN<32> {
    BytesN::random(e)
}

// ---- version() ----

#[test]
fn version_initial_value_is_one() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    assert_eq!(pool.version(), 1u32);
}

// ---- propose_upgrade ----

#[test]
fn propose_stores_hash_and_ready_at() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    let hash = random_hash(&e);
    pool.propose_upgrade(&hash);
    // We can verify by attempting execute before the timelock — it should fail
    let result = pool.try_execute_upgrade();
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeNotReady)));
}

#[test]
fn propose_fails_when_already_pending() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    pool.propose_upgrade(&random_hash(&e));
    let result = pool.try_propose_upgrade(&random_hash(&e));
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeNotReady)));
}

#[test]
fn non_admin_cannot_propose() {
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
            vault,
            lp,
            0i128,
            TIMELOCK_48H,
        ),
    );
    let pool = VaquitaPoolClient::new(&e, &pool_id);
    // No mock_all_auths — require_owner will fail
    let result = pool.try_propose_upgrade(&random_hash(&e));
    assert!(result.is_err());
}

// ---- cancel_upgrade ----

#[test]
fn cancel_clears_pending() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    pool.propose_upgrade(&random_hash(&e));
    pool.cancel_upgrade();
    // After cancel, execute should fail with UpgradeNotProposed
    let result = pool.try_execute_upgrade();
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeNotProposed)));
}

#[test]
fn cancel_fails_when_nothing_pending() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    let result = pool.try_cancel_upgrade();
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeNotProposed)));
}

#[test]
fn non_admin_cannot_cancel() {
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
            vault,
            lp,
            0i128,
            TIMELOCK_48H,
        ),
    );
    let pool = VaquitaPoolClient::new(&e, &pool_id);
    let result = pool.try_cancel_upgrade();
    assert!(result.is_err());
}

// ---- execute_upgrade ----

#[test]
fn execute_before_timelock_fails() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    pool.propose_upgrade(&random_hash(&e));
    // Don't jump time — should fail
    let result = pool.try_execute_upgrade();
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeNotReady)));
}

#[test]
fn execute_when_nothing_pending_fails() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    let result = pool.try_execute_upgrade();
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeNotProposed)));
}

#[test]
fn non_admin_cannot_execute() {
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
            vault,
            lp,
            0i128,
            TIMELOCK_48H,
        ),
    );
    let pool = VaquitaPoolClient::new(&e, &pool_id);
    let result = pool.try_execute_upgrade();
    assert!(result.is_err());
}

// ---- Round-trip: propose → wait → execute ----

// The pool's own WASM (built by `make build`) is used as the upgrade target.
// Tests that use UPGRADE_WASM require `make test` (not bare `cargo test`)
// because `make test` builds the WASM before running tests.
const UPGRADE_WASM: &[u8] =
    include_bytes!("../../../target/wasm32v1-none/release/vaquita_pool.wasm");

#[test]
fn propose_wait_execute_increments_version() {
    let e = Env::default();
    let (_, pool) = deploy(&e);

    assert_eq!(pool.version(), 1u32);

    let wasm_hash = e.deployer().upload_contract_wasm(UPGRADE_WASM);
    pool.propose_upgrade(&wasm_hash);
    e.jump_time(TIMELOCK_48H + 1);
    pool.execute_upgrade();

    // version() is readable from WASM after upgrade (self-upgrade preserves interface)
    assert_eq!(pool.version(), 2u32);
}

#[test]
fn storage_preserved_after_upgrade() {
    let e = Env::default();
    let (_, pool) = deploy(&e);

    pool.pause();
    assert!(pool.is_paused());

    let wasm_hash = e.deployer().upload_contract_wasm(UPGRADE_WASM);
    pool.propose_upgrade(&wasm_hash);
    e.jump_time(TIMELOCK_48H + 1);
    pool.execute_upgrade();

    // Storage (paused flag) preserved after self-upgrade
    assert!(pool.is_paused());
    assert_eq!(pool.version(), 2u32);
}

// ---- lock_upgrades_forever ----

#[test]
fn lock_forever_blocks_propose() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    pool.lock_upgrades_forever();
    let result = pool.try_propose_upgrade(&random_hash(&e));
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeLocked)));
}

#[test]
fn lock_forever_blocks_execute() {
    let e = Env::default();
    let (_, pool) = deploy(&e);
    // Propose while still unlocked using a valid WASM
    // Use a random hash — execute_upgrade will be blocked before deployer is called
    let hash = random_hash(&e);
    pool.propose_upgrade(&hash);
    e.jump_time(TIMELOCK_48H + 1);
    // Lock after proposal is ready
    pool.lock_upgrades_forever();
    let result = pool.try_execute_upgrade();
    assert_eq!(result, Err(Ok(VaquitaPoolError::UpgradeLocked)));
}

#[test]
fn non_admin_cannot_lock() {
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
            vault,
            lp,
            0i128,
            TIMELOCK_48H,
        ),
    );
    let pool = VaquitaPoolClient::new(&e, &pool_id);
    let result = pool.try_lock_upgrades_forever();
    assert!(result.is_err());
}
