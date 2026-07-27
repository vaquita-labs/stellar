//! Persistent-storage layer for per-user deposit positions.
//!
//! Every `Positions(deposit_id)` entry lives in **persistent** storage so
//! each position has its own ledger entry and its own TTL, independently
//! archivable and restorable.  Instance storage is reserved for admin config
//! and the bounded per-period maps.
//!
//! ## `deposit_id` derivation
//! The contract derives every id as `sha256(caller || nonce)` (see
//! `VaquitaPool::compute_deposit_id`). Because the id is a function of the
//! depositor's address, collisions across owners are cryptographically
//! infeasible and no third party can squat another user's id (finding 1e484c83).

use soroban_sdk::{BytesN, Env};

use crate::types::{DataKey, Position};

// ---------- TTL constants ----------

/// Bump only when remaining TTL falls below this (≈1 day at 5 s/ledger).
pub const TTL_THRESHOLD_LEDGERS: u32 = 17_280;

/// Extend persistent position TTL to ≈90 days.  Safely exceeds the
/// maximum supported lock period (≤30 days).
pub const POSITION_TTL_EXTEND_TO: u32 = 1_555_200;

/// Extend instance storage TTL to ≈90 days on every state-changing call.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 1_555_200;

// ---------- Public read/write API ----------

pub fn get(env: &Env, deposit_id: &BytesN<32>) -> Option<Position> {
    env.storage()
        .persistent()
        .get(&DataKey::Positions(deposit_id.clone()))
}

/// Write a position to persistent storage and extend its TTL.
pub fn set(env: &Env, deposit_id: &BytesN<32>, position: &Position) {
    let key = DataKey::Positions(deposit_id.clone());
    env.storage().persistent().set(&key, position);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, POSITION_TTL_EXTEND_TO);
    increment_count(env, position.lock_period);
}

/// Remove a position from persistent storage and update counters.
pub fn remove(env: &Env, deposit_id: &BytesN<32>, lock_period: u64) {
    env.storage()
        .persistent()
        .remove(&DataKey::Positions(deposit_id.clone()));
    decrement_count(env, lock_period);
}

pub fn exists(env: &Env, deposit_id: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Positions(deposit_id.clone()))
}

pub fn extend_ttl(env: &Env, deposit_id: &BytesN<32>) {
    let key = DataKey::Positions(deposit_id.clone());
    if env.storage().persistent().has(&key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, POSITION_TTL_EXTEND_TO);
    }
}

/// Total number of open positions across all periods and depositors.
pub fn outstanding_count(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::PositionCount)
        .unwrap_or(0u64)
}

/// Open positions for a specific lock period (used by remove_lock_period guard).
pub fn outstanding_count_for_period(env: &Env, period: u64) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::PositionCountForPeriod(period))
        .unwrap_or(0u64)
}

// ---------- Instance TTL bump ----------

/// Bump instance storage TTL on every state-changing call.
pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, INSTANCE_TTL_EXTEND_TO);
}

// ---------- Private helpers ----------

fn increment_count(env: &Env, period: u64) {
    let global: u64 = env
        .storage()
        .instance()
        .get(&DataKey::PositionCount)
        .unwrap_or(0u64);
    env.storage()
        .instance()
        .set(&DataKey::PositionCount, &(global + 1));

    let per_period: u64 = env
        .storage()
        .instance()
        .get(&DataKey::PositionCountForPeriod(period))
        .unwrap_or(0u64);
    env.storage()
        .instance()
        .set(&DataKey::PositionCountForPeriod(period), &(per_period + 1));
}

fn decrement_count(env: &Env, period: u64) {
    let global: u64 = env
        .storage()
        .instance()
        .get(&DataKey::PositionCount)
        .unwrap_or(0u64);
    env.storage()
        .instance()
        .set(&DataKey::PositionCount, &global.saturating_sub(1));

    let per_period: u64 = env
        .storage()
        .instance()
        .get(&DataKey::PositionCountForPeriod(period))
        .unwrap_or(0u64);
    env.storage().instance().set(
        &DataKey::PositionCountForPeriod(period),
        &per_period.saturating_sub(1),
    );
}
