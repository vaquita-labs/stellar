use soroban_sdk::{contracttype, Address, Symbol};

#[contracttype]
pub enum DataKey {
    Admin,
    AdminSigningKey,
    NextTokenId,
    /// (badge_type, cycle_id, wallet) — prevents double-mint across all categories
    Claimed(Symbol, u32, Address),
    TokenOwner(u32),
    TokenBadgeType(u32),
    EditionCap(Symbol),
    EditionCount(Symbol),
    /// Per-badge-type mint policy (instance storage, admin-curated)
    MintPolicy(Symbol),
    /// Cumulative mint count per badge type (persistent storage)
    MintCount(Symbol),
    // Pause and upgrade state — set in constructor, governed by future slices
    Paused,
    Version,
    UpgradesLocked,
    PendingUpgradeHash,
    UpgradeReadyAt,
}

/// Per-badge-type mint policy. Governs how the Claimed key is constructed.
/// Logic enforced in the mint-policy slice; pre-declared here for events.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MintPolicy {
    OneTimeOnly = 0,
    PerCycle = 1,
}
