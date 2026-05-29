use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Symbol};

use crate::types::MintPolicy;

// Topic symbols (≤10 chars each)
const CONSTRUCTED: Symbol = symbol_short!("init");
const MINTED: Symbol = symbol_short!("minted");
const KEY_ROTATED: Symbol = symbol_short!("key_rot");
const TYPE_REG: Symbol = symbol_short!("type_reg");
const POLICY_UPD: Symbol = symbol_short!("pol_upd");
const CAP_UPD: Symbol = symbol_short!("cap_upd");
const PAUSED: Symbol = symbol_short!("paused");
const UNPAUSED: Symbol = symbol_short!("unpaused");
const UPG_PROP: Symbol = symbol_short!("upg_prop");
const UPG_CANC: Symbol = symbol_short!("upg_canc");
const UPG_EXEC: Symbol = symbol_short!("upg_exec");
const UPG_LOCK: Symbol = symbol_short!("upg_lock");

#[contracttype]
pub struct ConstructedEvent {
    pub admin: Address,
    pub signing_key: BytesN<32>,
}

#[contracttype]
pub struct MintedEvent {
    pub wallet: Address,
    pub badge_type: Symbol,
    pub cycle_id: u32,
    pub token_id: u32,
}

#[contracttype]
pub struct SigningKeyRotatedEvent {
    pub old_key: BytesN<32>,
    pub new_key: BytesN<32>,
}

#[contracttype]
pub struct BadgeTypeRegisteredEvent {
    pub badge_type: Symbol,
    pub policy: MintPolicy,
    pub edition_cap: Option<u32>,
}

#[contracttype]
pub struct MintPolicyUpdatedEvent {
    pub badge_type: Symbol,
    pub old_policy: MintPolicy,
    pub new_policy: MintPolicy,
}

#[contracttype]
pub struct EditionCapUpdatedEvent {
    pub badge_type: Symbol,
    pub new_cap: u32,
}

#[contracttype]
pub struct PausedEvent {
    pub admin: Address,
}

#[contracttype]
pub struct UnpausedEvent {
    pub admin: Address,
}

#[contracttype]
pub struct UpgradeProposedEvent {
    pub wasm_hash: BytesN<32>,
    pub ready_at: u64,
}

#[contracttype]
pub struct UpgradeCancelledEvent {
    pub wasm_hash: BytesN<32>,
}

#[contracttype]
pub struct UpgradeExecutedEvent {
    pub wasm_hash: BytesN<32>,
    pub new_version: u32,
}

#[contracttype]
pub struct UpgradesLockedEvent {
    pub admin: Address,
}

// ---- emit helpers (used now) ----

pub fn emit_constructed(env: &Env, admin: Address, signing_key: BytesN<32>) {
    env.events()
        .publish((CONSTRUCTED,), ConstructedEvent { admin, signing_key });
}

pub fn emit_minted(env: &Env, wallet: Address, badge_type: Symbol, cycle_id: u32, token_id: u32) {
    env.events().publish(
        (MINTED,),
        MintedEvent {
            wallet,
            badge_type,
            cycle_id,
            token_id,
        },
    );
}

pub fn emit_signing_key_rotated(env: &Env, old_key: BytesN<32>, new_key: BytesN<32>) {
    env.events()
        .publish((KEY_ROTATED,), SigningKeyRotatedEvent { old_key, new_key });
}

pub fn emit_badge_type_registered(
    env: &Env,
    badge_type: Symbol,
    policy: MintPolicy,
    edition_cap: Option<u32>,
) {
    env.events().publish(
        (TYPE_REG,),
        BadgeTypeRegisteredEvent {
            badge_type,
            policy,
            edition_cap,
        },
    );
}

// ---- emit helpers (emitted by future slices; defined here for completeness) ----

pub fn emit_mint_policy_updated(
    env: &Env,
    badge_type: Symbol,
    old_policy: MintPolicy,
    new_policy: MintPolicy,
) {
    env.events().publish(
        (POLICY_UPD,),
        MintPolicyUpdatedEvent {
            badge_type,
            old_policy,
            new_policy,
        },
    );
}

pub fn emit_edition_cap_updated(env: &Env, badge_type: Symbol, new_cap: u32) {
    env.events().publish(
        (CAP_UPD,),
        EditionCapUpdatedEvent {
            badge_type,
            new_cap,
        },
    );
}

pub fn emit_paused(env: &Env, admin: Address) {
    env.events().publish((PAUSED,), PausedEvent { admin });
}

pub fn emit_unpaused(env: &Env, admin: Address) {
    env.events().publish((UNPAUSED,), UnpausedEvent { admin });
}

pub fn emit_upgrade_proposed(env: &Env, wasm_hash: BytesN<32>, ready_at: u64) {
    env.events().publish(
        (UPG_PROP,),
        UpgradeProposedEvent {
            wasm_hash,
            ready_at,
        },
    );
}

pub fn emit_upgrade_cancelled(env: &Env, wasm_hash: BytesN<32>) {
    env.events()
        .publish((UPG_CANC,), UpgradeCancelledEvent { wasm_hash });
}

pub fn emit_upgrade_executed(env: &Env, wasm_hash: BytesN<32>, new_version: u32) {
    env.events().publish(
        (UPG_EXEC,),
        UpgradeExecutedEvent {
            wasm_hash,
            new_version,
        },
    );
}

pub fn emit_upgrades_locked(env: &Env, admin: Address) {
    env.events()
        .publish((UPG_LOCK,), UpgradesLockedEvent { admin });
}
