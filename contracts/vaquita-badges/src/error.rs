use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum BadgeError {
    AlreadyInitialized = 1,
    AlreadyClaimed = 2,
    SoulboundToken = 3,
    ClaimExpired = 4,
    Unauthorized = 5,
    EditionCapReached = 6,
    NotInitialized = 7,
    Paused = 8,
    UpgradeNotProposed = 9,
    UpgradeNotReady = 10,
    UpgradeLocked = 11,
}
