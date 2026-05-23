use soroban_sdk::{contracttype, symbol_short, Address, Env, String};

/// Topic symbols for each event type.
const DEPOSIT: soroban_sdk::Symbol = symbol_short!("deposit");
const WITHDRAW: soroban_sdk::Symbol = symbol_short!("withdraw");

/// Typed payload for a deposit event.
/// Topic: ("deposit", caller)  Data: DepositEvent
#[contracttype]
pub struct DepositEvent {
    pub deposit_id: String,
    pub token: Address,
    pub amount: i128,
    pub shares: i128,
}

/// Typed payload for a withdraw event.
/// Topic: ("withdraw", caller)  Data: WithdrawEvent
#[contracttype]
pub struct WithdrawEvent {
    pub deposit_id: String,
    pub token: Address,
    pub amount: i128,
    pub reward: i128,
}

pub fn emit_deposit(
    env: &Env,
    caller: Address,
    deposit_id: String,
    token: Address,
    amount: i128,
    shares: i128,
) {
    env.events().publish(
        (DEPOSIT, caller),
        DepositEvent { deposit_id, token, amount, shares },
    );
}

pub fn emit_withdraw(
    env: &Env,
    caller: Address,
    deposit_id: String,
    token: Address,
    amount: i128,
    reward: i128,
) {
    env.events().publish(
        (WITHDRAW, caller),
        WithdrawEvent { deposit_id, token, amount, reward },
    );
}
