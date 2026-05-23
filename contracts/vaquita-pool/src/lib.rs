#![no_std]
use soroban_sdk::{
    contract, contractimpl, vec, Address, Env, String, IntoVal, Vec, Symbol,
    token::Client as TokenClient,
    auth::{InvokerContractAuthEntry, ContractContext, SubContractInvocation},
};

mod admin;
mod arithmetic;
mod defindex_vault;
mod error;
mod events;
mod positions;
mod types;

pub use error::VaquitaPoolError;
pub use types::{DataKey, Period, Position};

use defindex_vault::DeFindexVaultClient;

// ==================== CONTRACT ====================

#[contract]
pub struct VaquitaPool;

#[contractimpl]
impl VaquitaPool {
    // ---------- Initialization ----------
    pub fn initialize(
        env: Env,
        admin: Address,
        blend_token: Address,
        defindex_vault_address: Address,
        lock_periods: Vec<u64>,
    ) -> Result<(), VaquitaPoolError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VaquitaPoolError::DepositAlreadyExists);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::BlendToken, &blend_token);
        env.storage().instance().set(&DataKey::DeFindexVaultAddress, &defindex_vault_address);
        env.storage().instance().set(&DataKey::BasisPoints, &10000i128);
        env.storage().instance().set(&DataKey::EarlyWithdrawalFee, &0i128);
        env.storage().instance().set(&DataKey::ProtocolFees, &0i128);

        for lp in lock_periods.iter() {
            env.storage()
                .instance()
                .set(&DataKey::SupportedLockPeriod(lp), &true);
        }
        Ok(())
    }

    // ---------- Deposit ----------
    pub fn deposit(
        env: Env,
        caller: Address,
        deposit_id: String,
        amount: i128,
        period: u64,
    ) -> Result<(), VaquitaPoolError> {
        caller.require_auth();

        if amount <= 0 {
            return Err(VaquitaPoolError::InvalidAmount);
        }
        if positions::exists(&env, &deposit_id) {
            return Err(VaquitaPoolError::DepositAlreadyExists);
        }
        let supported: bool = env
            .storage()
            .instance()
            .get(&DataKey::SupportedLockPeriod(period))
            .unwrap_or(false);
        if !supported {
            return Err(VaquitaPoolError::InvalidPeriod);
        }

        let blend_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::BlendToken)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let defindex_vault_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::DeFindexVaultAddress)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let contract_address = env.current_contract_address();
        let finalization_time = env.ledger().timestamp() + period;

        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&caller, &contract_address, &amount);

        let defindex_vault_client = DeFindexVaultClient::new(&env, &defindex_vault_address);
        let shares_before = defindex_vault_client.balance(&contract_address);

        env.authorize_as_current_contract(vec![
            &env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: blend_token.clone(),
                    fn_name: Symbol::new(&env, "transfer"),
                    args: vec![
                        &env,
                        contract_address.clone().into_val(&env),
                        defindex_vault_address.clone().into_val(&env),
                        amount.into_val(&env),
                    ],
                },
                sub_invocations: vec![&env],
            }),
        ]);

        let amounts_desired = vec![&env, amount];
        let amounts_min = vec![&env, amount];
        let (_actual_amounts, _minted_reported, _allocations) = defindex_vault_client.deposit(
            &amounts_desired,
            &amounts_min,
            &contract_address,
            &true,
        );
        let shares_after = defindex_vault_client.balance(&contract_address);
        if shares_after < shares_before {
            return Err(VaquitaPoolError::VaultShareBalanceDecreased);
        }
        let shares = arithmetic::checked_sub(shares_after, shares_before)?;
        if shares <= 0 {
            return Err(VaquitaPoolError::VaultReturnedZeroShares);
        }

        let position = Position {
            owner: caller.clone(),
            amount,
            shares,
            finalization_time,
            lock_period: period,
        };
        positions::set(&env, &deposit_id, &position);

        let mut period_data: Period = env
            .storage()
            .instance()
            .get(&DataKey::Periods(period))
            .unwrap_or(Period { reward_pool: 0, total_deposits: 0 });
        period_data.total_deposits = arithmetic::checked_add(period_data.total_deposits, amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Periods(period), &period_data);

        positions::bump_instance(&env);
        events::emit_deposit(&env, caller, deposit_id, blend_token, amount, shares);
        Ok(())
    }

    // ---------- Withdraw ----------
    pub fn withdraw(
        env: Env,
        caller: Address,
        deposit_id: String,
    ) -> Result<(), VaquitaPoolError> {
        caller.require_auth();

        let position: Position = positions::get(&env, &deposit_id)
            .ok_or(VaquitaPoolError::PositionNotFound)?;

        if caller != position.owner {
            return Err(VaquitaPoolError::NotOwner);
        }

        let blend_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::BlendToken)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let defindex_vault_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::DeFindexVaultAddress)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let contract_address = env.current_contract_address();

        let defindex_vault_client = DeFindexVaultClient::new(&env, &defindex_vault_address);
        let withdrawn_amounts = defindex_vault_client.withdraw(
            &position.shares,
            &vec![&env, 0i128],
            &contract_address,
        );
        let gross = withdrawn_amounts.get_unchecked(0);

        let interest = if gross > position.amount {
            arithmetic::checked_sub(gross, position.amount)?
        } else {
            0
        };

        let now = env.ledger().timestamp();
        let mut amount_to_transfer = gross;
        let mut reward: i128 = 0;

        let mut period_data: Period = env
            .storage()
            .instance()
            .get(&DataKey::Periods(position.lock_period))
            .ok_or(VaquitaPoolError::PeriodDataNotFound)?;

        if now < position.finalization_time {
            let early_fee: i128 = env
                .storage()
                .instance()
                .get(&DataKey::EarlyWithdrawalFee)
                .unwrap_or(0);
            let basis_points: i128 = env
                .storage()
                .instance()
                .get(&DataKey::BasisPoints)
                .unwrap_or(10000);
            let fee_amount = arithmetic::checked_div(
                arithmetic::checked_mul(interest, early_fee)?,
                basis_points,
            )?;
            let remaining_interest = arithmetic::checked_sub(interest, fee_amount)?;
            let mut protocol_fees: i128 = env
                .storage()
                .instance()
                .get(&DataKey::ProtocolFees)
                .unwrap_or(0);
            protocol_fees = arithmetic::checked_add(protocol_fees, fee_amount)?;
            env.storage()
                .instance()
                .set(&DataKey::ProtocolFees, &protocol_fees);
            period_data.reward_pool = arithmetic::checked_add(period_data.reward_pool, remaining_interest)?;
            amount_to_transfer = arithmetic::checked_sub(amount_to_transfer, interest)?;
        } else {
            reward = Self::calculate_reward(&period_data, position.amount)?;
            period_data.reward_pool = arithmetic::checked_sub(period_data.reward_pool, reward)?;
            amount_to_transfer = arithmetic::checked_add(amount_to_transfer, reward)?;
        }

        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&contract_address, &caller, &amount_to_transfer);

        period_data.total_deposits = arithmetic::checked_sub(period_data.total_deposits, position.amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Periods(position.lock_period), &period_data);
        positions::remove(&env, &deposit_id, position.lock_period);

        positions::bump_instance(&env);
        events::emit_withdraw(&env, caller, deposit_id, blend_token, amount_to_transfer, reward);
        Ok(())
    }

    fn calculate_reward(period_data: &Period, amount: i128) -> Result<i128, VaquitaPoolError> {
        if period_data.total_deposits == 0 {
            return Ok(0);
        }
        arithmetic::checked_div(
            arithmetic::checked_mul(period_data.reward_pool, amount)?,
            period_data.total_deposits,
        )
    }

    // ---------- Admin entrypoints ----------

    pub fn withdraw_protocol_fees(env: Env) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let blend_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::BlendToken)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let contract_address = env.current_contract_address();
        let protocol_fees: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ProtocolFees)
            .unwrap_or(0);

        if protocol_fees > 0 {
            let token_client = TokenClient::new(&env, &blend_token);
            token_client.transfer(&contract_address, &admin, &protocol_fees);
            env.storage()
                .instance()
                .set(&DataKey::ProtocolFees, &0i128);
        }
        positions::bump_instance(&env);
        Ok(())
    }

    pub fn add_rewards(
        env: Env,
        period: u64,
        reward_amount: i128,
    ) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;

        if reward_amount <= 0 {
            return Err(VaquitaPoolError::InvalidAmount);
        }
        let supported: bool = env
            .storage()
            .instance()
            .get(&DataKey::SupportedLockPeriod(period))
            .unwrap_or(false);
        if !supported {
            return Err(VaquitaPoolError::LockPeriodNotSupported);
        }
        let period_data: Period = env
            .storage()
            .instance()
            .get(&DataKey::Periods(period))
            .unwrap_or(Period { reward_pool: 0, total_deposits: 0 });
        if period_data.total_deposits == 0 {
            return Err(VaquitaPoolError::PeriodHasNoDeposits);
        }

        let blend_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::BlendToken)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let contract_address = env.current_contract_address();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaquitaPoolError::NotInitialized)?;
        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&admin, &contract_address, &reward_amount);

        let mut updated = period_data;
        updated.reward_pool = arithmetic::checked_add(updated.reward_pool, reward_amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Periods(period), &updated);
        positions::bump_instance(&env);
        Ok(())
    }

    pub fn update_early_withdrawal_fee(
        env: Env,
        new_fee: i128,
    ) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;
        let basis_points: i128 = env
            .storage()
            .instance()
            .get(&DataKey::BasisPoints)
            .unwrap_or(10000);
        if new_fee > basis_points {
            return Err(VaquitaPoolError::InvalidFee);
        }
        env.storage()
            .instance()
            .set(&DataKey::EarlyWithdrawalFee, &new_fee);
        positions::bump_instance(&env);
        Ok(())
    }

    pub fn add_lock_period(
        env: Env,
        new_lock_period: u64,
    ) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;
        let exists: bool = env
            .storage()
            .instance()
            .get(&DataKey::SupportedLockPeriod(new_lock_period))
            .unwrap_or(false);
        if exists {
            return Err(VaquitaPoolError::LockPeriodAlreadySupported);
        }
        env.storage()
            .instance()
            .set(&DataKey::SupportedLockPeriod(new_lock_period), &true);
        positions::bump_instance(&env);
        Ok(())
    }

    // ---------- View functions ----------
    pub fn get_position(env: Env, deposit_id: String) -> Option<Position> {
        positions::get(&env, &deposit_id)
    }

    pub fn get_period_data(env: Env, period: u64) -> Option<Period> {
        env.storage().instance().get(&DataKey::Periods(period))
    }
}

#[cfg(test)]
mod test;
