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
    /// Signed delta applied to every withdraw payout (test hook).
    WithdrawAdjustment,
    /// Test: burn this many of `from`'s shares before crediting the deposit.
    TestStealSharesOnDeposit,
    /// Test: transfer assets in but do not mint shares (broken vault).
    TestSkipShareMint,
}

#[contract]
pub struct MockDeFindexVault;

#[contractimpl]
impl MockDeFindexVault {
    pub fn __constructor(env: Env, asset: Address) {
        env.storage().instance().set(&DataKey::Asset, &asset);
        env.storage()
            .instance()
            .set(&DataKey::WithdrawAdjustment, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::TestStealSharesOnDeposit, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::TestSkipShareMint, &false);
    }

    /// Changes gross asset returned by `withdraw` vs. share burn (default 1:1).
    pub fn test_set_withdraw_adjustment(env: Env, delta: i128) {
        env.storage()
            .instance()
            .set(&DataKey::WithdrawAdjustment, &delta);
    }

    pub fn test_set_steal_shares_on_deposit(env: Env, steal: i128) {
        env.storage()
            .instance()
            .set(&DataKey::TestStealSharesOnDeposit, &steal);
    }

    pub fn test_set_skip_share_mint(env: Env, skip: bool) {
        env.storage()
            .instance()
            .set(&DataKey::TestSkipShareMint, &skip);
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
        let steal: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TestStealSharesOnDeposit)
            .unwrap_or(0);
        let mut current_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Shares(from.clone()))
            .unwrap_or(0);
        if steal != 0 {
            current_shares = current_shares.saturating_sub(steal);
            env.storage()
                .instance()
                .set(&DataKey::TestStealSharesOnDeposit, &0i128);
        }
        let skip_mint: bool = env
            .storage()
            .instance()
            .get(&DataKey::TestSkipShareMint)
            .unwrap_or(false);
        if skip_mint {
            env.storage()
                .instance()
                .set(&DataKey::Shares(from.clone()), &current_shares);
            env.storage()
                .instance()
                .set(&DataKey::TestSkipShareMint, &false);
        } else {
            env.storage()
                .instance()
                .set(&DataKey::Shares(from.clone()), &(current_shares + amount));
        }
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
        env.storage().instance().set(
            &DataKey::Shares(from.clone()),
            &(current_shares - withdraw_shares),
        );
        let asset: Address = env.storage().instance().get(&DataKey::Asset).unwrap();
        let token = TokenClient::new(&env, &asset);
        let adjustment: i128 = env
            .storage()
            .instance()
            .get(&DataKey::WithdrawAdjustment)
            .unwrap_or(0);
        let payout = withdraw_shares.saturating_add(adjustment);
        if payout <= 0 {
            panic!("Invalid payout");
        }
        token.transfer(&env.current_contract_address(), &from, &payout);
        env.events().publish(
            (ASSET, Symbol::new(&env, "withdraw")),
            (withdraw_shares, from),
        );
        vec![&env, payout]
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Shares(id))
            .unwrap_or(0)
    }
}
