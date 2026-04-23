#![cfg(test)]
//! Minimal pass-through mock of the DeFindex vault used in integration tests.
//!
//! Matches the public interface of the real DeFindex vault (single-asset mode):
//!   - `deposit(amounts_desired, amounts_min, from, invest) -> (amounts, shares, allocations)`
//!   - `withdraw(withdraw_shares, min_amounts_out, from) -> amounts`
//!
//! Shares are minted 1:1 with the deposited amount, so a position's `shares`
//! and `amount` values are identical in tests. Yield can be simulated by
//! minting extra asset to this mock contract between deposit and withdraw.

use soroban_sdk::{
    contract, contractimpl, contracttype, token::Client as TokenClient, vec, Address, Env, Symbol,
    Vec,
};

const ASSET: Symbol = soroban_sdk::symbol_short!("asset");

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Asset,
    Shares(Address),
}

#[contract]
pub struct MockDeFindexVault;

#[contractimpl]
impl MockDeFindexVault {
    pub fn __constructor(env: Env, asset: Address) {
        env.storage().instance().set(&DataKey::Asset, &asset);
    }

    pub fn asset(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Asset).unwrap()
    }

    pub fn deposit(
        env: Env,
        amounts_desired: Vec<i128>,
        _amounts_min: Vec<i128>,
        from: Address,
        _invest: bool,
    ) -> (Vec<i128>, i128, Option<Vec<i128>>) {
        let amount = amounts_desired.get_unchecked(0);
        let asset: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = TokenClient::new(&env, &asset);
        token.transfer(&from, &env.current_contract_address(), &amount);
        let current_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Shares(from.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::Shares(from.clone()), &(current_shares + amount));
        env.events()
            .publish((ASSET, Symbol::new(&env, "deposit")), (amount, from));
        (vec![&env, amount], amount, None)
    }

    pub fn withdraw(
        env: Env,
        withdraw_shares: i128,
        _min_amounts_out: Vec<i128>,
        from: Address,
    ) -> Vec<i128> {
        let current_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Shares(from.clone()))
            .unwrap_or(0);
        if withdraw_shares > current_shares {
            panic!("Insufficient shares");
        }
        env.storage()
            .instance()
            .set(&DataKey::Shares(from.clone()), &(current_shares - withdraw_shares));
        let asset: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = TokenClient::new(&env, &asset);
        token.transfer(&env.current_contract_address(), &from, &withdraw_shares);
        env.events().publish(
            (ASSET, Symbol::new(&env, "withdraw")),
            (withdraw_shares, from),
        );
        vec![&env, withdraw_shares]
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Shares(id))
            .unwrap_or(0)
    }
}
