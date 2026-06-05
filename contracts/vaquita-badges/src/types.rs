use soroban_sdk::{contracttype, Address, Symbol};

#[contracttype]
pub enum DataKey {
    Admin,
    AdminSigningKey,
    NextTokenId,
    /// (badge_type, cycle_id, wallet) — prevents double-mint.
    /// cycle_id is a backend-controlled pass-through: 0 for one-time badges,
    /// the actual cycle id for leaderboard/recurring badges.
    Claimed(Symbol, u32, Address),
    TokenOwner(u32),
    TokenBadgeType(u32),
    EditionCap(Symbol),
    EditionCount(Symbol),
    // Pause and upgrade state
    Paused,
    Version,
    UpgradesLocked,
    UpgradeTimelockSecs,
    PendingUpgradeHash,
    UpgradeReadyAt,
}
