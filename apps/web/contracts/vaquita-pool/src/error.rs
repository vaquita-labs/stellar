use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DeFindexError {
    /// Insufficient profit after swaps
    InsufficientProfit = 1,
    /// Invalid invocations (empty or exceeds limit)
    InvalidInvocations = 2,
    /// Swap execution failed
    SwapFailed = 3,
    /// Flash loan repayment failed
    RepaymentFailed = 4,
    /// Unauthorized caller
    Unauthorized = 5,
    /// Invalid parameters
    InvalidArgument = 6,

    NegativeNotAllowed= 7
}