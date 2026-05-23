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
}
