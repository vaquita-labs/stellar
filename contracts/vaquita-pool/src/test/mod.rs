#![cfg(test)]
//! Test harness for the vaquita-pool contract.
//!
//! Layout:
//! - `mod.rs` (this file): generic helpers shared by every test — env
//!   utilities, numeric assertions, constants, and a minimal `MockPool`
//!   used to exercise the `b_rate` logic in isolation.
//! - `blend_fixture.rs`: deploys the Blend Protocol contracts end-to-end
//!   so integration tests can run against a realistic lending pool.
//! - `success.rs` (and future `*.rs` files): individual test cases.
//!
//! When the NFT contract lands, it can get its own `src/test/` tree with
//! the same shape. If helpers start to overlap across crates we can
//! promote them to a dedicated `contracts/test-utils` dev-only crate.

#![allow(dead_code)]

pub extern crate std;

pub mod blend_fixture;

pub const ONE_DAY_IN_SECONDS: u64 = 86_400;
pub const REWARD_THRESHOLD: i128 = 1;
pub const SCALAR_7: i128 = 1_0000000;
pub const ONE_DAY_LEDGERS: u32 = 17280;

use soroban_fixed_point_math::FixedPoint;
use soroban_sdk::{
    testutils::{Ledger as _, LedgerInfo},
    Env,
};

// ---------- Env extension ----------

pub trait EnvTestUtils {
    /// Jump the env by the given amount of ledgers. Assumes 5 seconds per ledger.
    fn jump(&self, ledgers: u32);

    /// Jump the env by the given amount of seconds. Increments the sequence by 1.
    fn jump_time(&self, seconds: u64);

    /// Set the ledger to the default LedgerInfo.
    ///
    /// Time -> 1441065600 (Sept 1st, 2015 12:00:00 AM UTC)
    /// Sequence -> 100
    fn set_default_info(&self);
}

impl EnvTestUtils for Env {
    fn jump(&self, ledgers: u32) {
        self.ledger().set(LedgerInfo {
            timestamp: self.ledger().timestamp().saturating_add(ledgers as u64 * 5),
            protocol_version: 22,
            sequence_number: self.ledger().sequence().saturating_add(ledgers),
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 30 * ONE_DAY_LEDGERS,
            min_persistent_entry_ttl: 30 * ONE_DAY_LEDGERS,
            max_entry_ttl: 365 * ONE_DAY_LEDGERS,
        });
    }

    fn jump_time(&self, seconds: u64) {
        self.ledger().set(LedgerInfo {
            timestamp: self.ledger().timestamp().saturating_add(seconds),
            protocol_version: 22,
            sequence_number: self.ledger().sequence().saturating_add(1),
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 30 * ONE_DAY_LEDGERS,
            min_persistent_entry_ttl: 30 * ONE_DAY_LEDGERS,
            max_entry_ttl: 365 * ONE_DAY_LEDGERS,
        });
    }

    fn set_default_info(&self) {
        self.ledger().set(LedgerInfo {
            timestamp: 1441065600,
            protocol_version: 22,
            sequence_number: 100,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 30 * ONE_DAY_LEDGERS,
            min_persistent_entry_ttl: 30 * ONE_DAY_LEDGERS,
            max_entry_ttl: 365 * ONE_DAY_LEDGERS,
        });
    }
}

// ---------- Numeric assertions ----------

pub fn assert_approx_eq_rel(a: i128, b: i128, percentage: i128) {
    let rel_delta = b.fixed_mul_floor(percentage, SCALAR_7).unwrap();

    assert!(
        a > b - rel_delta && a < b + rel_delta,
        "assertion failed: `(left != right)` \
         (left: `{:?}`, right: `{:?}`, epsilon: `{:?}`)",
        a,
        b,
        rel_delta
    );
}

// ---------- Mock pool to test b_rate updates in isolation ----------

pub mod mockpool {
    use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

    const BRATE: Symbol = symbol_short!("b_rate");

    #[derive(Clone, Debug)]
    #[contracttype]
    pub struct Reserve {
        pub asset: Address,
        pub config: ReserveConfig,
        pub data: ReserveData,
        pub scalar: i128,
    }

    #[derive(Clone, Debug, Default)]
    #[contracttype]
    pub struct ReserveConfig {
        pub index: u32,
        pub decimals: u32,
        pub c_factor: u32,
        pub l_factor: u32,
        pub util: u32,
        pub max_util: u32,
        pub r_base: u32,
        pub r_one: u32,
        pub r_two: u32,
        pub r_three: u32,
        pub reactivity: u32,
        pub supply_cap: i128,
        pub enabled: bool,
    }

    #[derive(Clone, Debug, Default)]
    #[contracttype]
    pub struct ReserveData {
        pub d_rate: i128,
        pub b_rate: i128,
        pub ir_mod: i128,
        pub b_supply: i128,
        pub d_supply: i128,
        pub backstop_credit: i128,
        pub last_time: u64,
    }

    #[contract]
    pub struct MockPool;

    #[contractimpl]
    impl MockPool {
        pub fn __constructor(e: Env, b_rate: i128) {
            e.storage().instance().set(&BRATE, &b_rate);
        }

        pub fn set_b_rate(e: Env, b_rate: i128) {
            e.storage().instance().set(&BRATE, &b_rate);
        }

        /// Only the `b_rate` slot is meaningful; everything else is a stub.
        pub fn get_reserve(e: Env, reserve: Address) -> Reserve {
            let mut r_data = ReserveData::default();
            r_data.b_rate = e.storage().instance().get(&BRATE).unwrap_or(0);
            Reserve {
                asset: reserve,
                config: ReserveConfig::default(),
                data: r_data,
                scalar: 0,
            }
        }
    }
}

pub mod mock_defindex_vault;

mod arithmetic;
mod conservation;
mod pause;
mod pool_coverage;
mod positions;
mod success;
mod upgrade;
mod vault_repoint;

/// Test helper: calculates the reward share for `amount` given `period_data`.
/// Equivalent to the private `VaquitaPool::calculate_reward` method.
pub fn test_calculate_reward(period_data: &crate::Period, amount: i128) -> i128 {
    if period_data.total_deposits == 0 {
        return 0;
    }
    (period_data.reward_pool * amount) / period_data.total_deposits
}
