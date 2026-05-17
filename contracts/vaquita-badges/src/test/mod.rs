#![cfg(test)]

pub extern crate std;

pub const ONE_DAY_LEDGERS: u32 = 17280;

use soroban_sdk::{
    testutils::{Ledger as _, LedgerInfo},
    Env,
};

pub trait EnvTestUtils {
    fn set_default_info(&self);
}

impl EnvTestUtils for Env {
    fn set_default_info(&self) {
        self.ledger().set(LedgerInfo {
            timestamp: 1_748_000_000, // ~May 2026
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

mod badges_test;
