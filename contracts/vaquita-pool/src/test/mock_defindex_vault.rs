#![cfg(test)]
//! Minimal pass-through mock of the DeFindex vault used in integration tests.
//!
//! The real vault invests the underlying asset into a Blend strategy, but for
//! unit-testing the vaquita-pool contract we only need a contract that:
//!   1. Pulls the underlying token from `from` on `deposit(amount, from)`.
//!   2. Sends it back to `to` on `withdraw(amount, from, to)`.
//!
//! Keeping it this thin avoids the complex constructor/config of the real
//! vault while still exercising the full auth + transfer path in the
//! vaquita-pool contract.

use soroban_sdk::{
    contract, contractimpl, contracttype, token::Client as TokenClient, Address, Env, Symbol,
};

const ASSET: Symbol = soroban_sdk::symbol_short!("asset");

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Asset,
}

#[contract]
pub struct MockDeFindexVault;

#[contractimpl]
impl MockDeFindexVault {
    /// `asset` is the underlying token the vault pulls in and pays out.
    pub fn __constructor(env: Env, asset: Address) {
        env.storage().instance().set(&DataKey::Asset, &asset);
    }

    pub fn asset(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Asset).unwrap()
    }

    /// Returns the deposited amount so it matches the real vault's signature
    /// (`deposit(amount, from) -> i128`).
    pub fn deposit(env: Env, amount: i128, from: Address) -> i128 {
        let asset: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = TokenClient::new(&env, &asset);
        token.transfer(&from, &env.current_contract_address(), &amount);
        env.events()
            .publish((ASSET, Symbol::new(&env, "deposit")), (amount, from));
        amount
    }

    /// Returns the withdrawn amount so it matches the real vault's signature
    /// (`withdraw(amount, from, to) -> i128`).
    pub fn withdraw(env: Env, amount: i128, _from: Address, to: Address) -> i128 {
        let asset: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = TokenClient::new(&env, &asset);
        token.transfer(&env.current_contract_address(), &to, &amount);
        env.events()
            .publish((ASSET, Symbol::new(&env, "withdraw")), (amount, to));
        amount
    }

    pub fn balance(env: Env) -> i128 {
        let asset: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = TokenClient::new(&env, &asset);
        token.balance(&env.current_contract_address())
    }
}
