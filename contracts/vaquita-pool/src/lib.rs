#![no_std]
use soroban_sdk::{
    contract, contractimpl, token::Client as TokenClient, Address, BytesN, Env, IntoVal, String,
    Vec,
};

mod accounting;
mod admin;
mod arithmetic;
mod defindex_vault;
mod error;
mod events;
mod pause;
mod positions;
mod token_config;
mod types;
mod upgrade;
mod vault_adapter;

pub use error::VaquitaPoolError;
pub use types::{DataKey, Period, Position};

// ==================== CONTRACT ====================

#[contract]
pub struct VaquitaPool;

#[contractimpl]
impl VaquitaPool {
    // ---------- Constructor ----------
    // Runs exactly once at deployment (enforced by the Soroban host).
    // All future slices read these slots without re-initializing them.
    pub fn __constructor(
        env: Env,
        admin: Address,
        blend_token: Address,
        defindex_vault_address: Address,
        lock_periods: Vec<u64>,
        early_withdrawal_fee_bps: i128,
        upgrade_timelock_secs: u64,
    ) {
        // Enforce 20% cap at deploy time — invalid args must fail the deployment tx
        assert!(early_withdrawal_fee_bps >= 0 && early_withdrawal_fee_bps <= 2000);

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::BlendToken, &blend_token);
        env.storage()
            .instance()
            .set(&DataKey::DeFindexVaultAddress, &defindex_vault_address);
        env.storage()
            .instance()
            .set(&DataKey::BasisPoints, &10000i128);
        env.storage()
            .instance()
            .set(&DataKey::EarlyWithdrawalFee, &early_withdrawal_fee_bps);
        env.storage().instance().set(&DataKey::ProtocolFees, &0i128);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Version, &1u32);
        env.storage()
            .instance()
            .set(&DataKey::UpgradesLocked, &false);
        env.storage()
            .instance()
            .set(&DataKey::UpgradeTimelockSecs, &upgrade_timelock_secs);

        for lp in lock_periods.iter() {
            env.storage()
                .instance()
                .set(&DataKey::SupportedLockPeriod(lp), &true);
        }

        events::emit_constructed(
            &env,
            admin,
            blend_token,
            defindex_vault_address,
            lock_periods,
        );
    }

    // ---------- Deposit ----------
    pub fn deposit(
        env: Env,
        caller: Address,
        deposit_id: String,
        amount: i128,
        period: u64,
    ) -> Result<(), VaquitaPoolError> {
        caller.require_auth_for_args(
            (caller.clone(), deposit_id.clone(), amount, period).into_val(&env),
        );
        pause::require_not_paused(&env)?;

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

        let shares =
            vault_adapter::deposit_into_vault(&env, &blend_token, &defindex_vault_address, amount)?;

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
            .unwrap_or(Period {
                reward_pool: 0,
                total_deposits: 0,
            });
        period_data.total_deposits = arithmetic::checked_add(period_data.total_deposits, amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Periods(period), &period_data);

        accounting::add_principal(&env, amount)?;

        positions::extend_instance(&env);
        events::emit_deposit(&env, caller, deposit_id, blend_token, amount, shares);
        Ok(())
    }

    // ---------- Withdraw ----------
    pub fn withdraw(env: Env, caller: Address, deposit_id: String) -> Result<(), VaquitaPoolError> {
        caller.require_auth_for_args((caller.clone(), deposit_id.clone()).into_val(&env));

        let position: Position =
            positions::get(&env, &deposit_id).ok_or(VaquitaPoolError::PositionNotFound)?;

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

        let gross = vault_adapter::withdraw_from_vault(
            &env,
            &defindex_vault_address,
            position.shares,
            position.amount,
        )?;

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
            period_data.reward_pool =
                arithmetic::checked_add(period_data.reward_pool, remaining_interest)?;
            accounting::add_reward_pool(&env, remaining_interest)?;
            amount_to_transfer = arithmetic::checked_sub(amount_to_transfer, interest)?;
        } else {
            reward = Self::calculate_reward(&period_data, position.amount)?;
            period_data.reward_pool = arithmetic::checked_sub(period_data.reward_pool, reward)?;
            accounting::sub_reward_pool(&env, reward)?;
            amount_to_transfer = arithmetic::checked_add(amount_to_transfer, reward)?;
        }

        accounting::sub_principal(&env, position.amount)?;
        accounting::assert_solvent(&env)?;

        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&contract_address, &caller, &amount_to_transfer);

        period_data.total_deposits =
            arithmetic::checked_sub(period_data.total_deposits, position.amount)?;
        env.storage()
            .instance()
            .set(&DataKey::Periods(position.lock_period), &period_data);
        positions::remove(&env, &deposit_id, position.lock_period);

        positions::extend_instance(&env);
        events::emit_withdraw(
            &env,
            caller,
            deposit_id,
            blend_token,
            amount_to_transfer,
            reward,
        );
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
            accounting::assert_solvent(&env)?;
            let token_client = TokenClient::new(&env, &blend_token);
            token_client.transfer(&contract_address, &admin, &protocol_fees);
            env.storage().instance().set(&DataKey::ProtocolFees, &0i128);
            events::emit_protocol_fees_withdrawn(&env, admin, protocol_fees);
        }
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn add_rewards(env: Env, period: u64, reward_amount: i128) -> Result<(), VaquitaPoolError> {
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
            .unwrap_or(Period {
                reward_pool: 0,
                total_deposits: 0,
            });
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
        accounting::add_reward_pool(&env, reward_amount)?;
        events::emit_rewards_added(&env, period, reward_amount);
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn update_early_withdrawal_fee(env: Env, new_fee: i128) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;
        if new_fee < 0 {
            return Err(VaquitaPoolError::InvalidFee);
        }
        if new_fee > 2000 {
            return Err(VaquitaPoolError::FeeCapExceeded);
        }
        let old_fee: i128 = env
            .storage()
            .instance()
            .get(&DataKey::EarlyWithdrawalFee)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::EarlyWithdrawalFee, &new_fee);
        events::emit_fee_updated(&env, old_fee, new_fee);
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn add_lock_period(env: Env, new_lock_period: u64) -> Result<(), VaquitaPoolError> {
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
        events::emit_lock_period_added(&env, new_lock_period);
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), VaquitaPoolError> {
        pause::pause(&env)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), VaquitaPoolError> {
        pause::unpause(&env)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn remove_lock_period(env: Env, period: u64) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;
        let supported: bool = env
            .storage()
            .instance()
            .get(&DataKey::SupportedLockPeriod(period))
            .unwrap_or(false);
        if !supported {
            return Err(VaquitaPoolError::LockPeriodNotSupported);
        }
        if positions::outstanding_count_for_period(&env, period) > 0 {
            return Err(VaquitaPoolError::LockPeriodHasPositions);
        }
        if let Some(pd) = env
            .storage()
            .instance()
            .get::<DataKey, Period>(&DataKey::Periods(period))
        {
            if pd.reward_pool > 0 {
                let fees: i128 = env
                    .storage()
                    .instance()
                    .get(&DataKey::ProtocolFees)
                    .unwrap_or(0);
                let new_fees = arithmetic::checked_add(fees, pd.reward_pool)?;
                env.storage()
                    .instance()
                    .set(&DataKey::ProtocolFees, &new_fees);
                accounting::sub_reward_pool(&env, pd.reward_pool)?;
            }
            env.storage().instance().remove(&DataKey::Periods(period));
        }
        env.storage()
            .instance()
            .remove(&DataKey::SupportedLockPeriod(period));
        events::emit_lock_period_removed(&env, period);
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn set_defindex_vault(env: Env, new_vault: Address) -> Result<(), VaquitaPoolError> {
        vault_adapter::set_vault_address(&env, new_vault)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn set_blend_token(env: Env, new_token: Address) -> Result<(), VaquitaPoolError> {
        token_config::set_blend_token(&env, new_token)?;
        positions::extend_instance(&env);
        Ok(())
    }

    // ---------- Upgrade entrypoints ----------

    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), VaquitaPoolError> {
        upgrade::propose_upgrade(&env, new_wasm_hash)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn cancel_upgrade(env: Env) -> Result<(), VaquitaPoolError> {
        upgrade::cancel_upgrade(&env)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn execute_upgrade(env: Env) -> Result<(), VaquitaPoolError> {
        upgrade::execute_upgrade(&env)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn lock_upgrades_forever(env: Env) -> Result<(), VaquitaPoolError> {
        upgrade::lock_upgrades_forever(&env)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn update_upgrade_timelock_secs(
        env: Env,
        new_secs: u64,
    ) -> Result<(), VaquitaPoolError> {
        upgrade::update_upgrade_timelock_secs(&env, new_secs)?;
        positions::extend_instance(&env);
        Ok(())
    }

    pub fn migrate(env: Env) -> Result<(), VaquitaPoolError> {
        admin::require_owner(&env)?;
        // v1: no-op — reserved for future version migrations
        Ok(())
    }

    // ---------- View functions ----------
    pub fn is_paused(env: Env) -> bool {
        pause::is_paused(&env)
    }

    pub fn get_position(env: Env, deposit_id: String) -> Option<Position> {
        positions::get(&env, &deposit_id)
    }

    /// Extend the TTL of an open position so it is not archived before maturity.
    /// Anyone may call this — no auth required.
    pub fn refresh_position_ttl(env: Env, deposit_id: String) {
        positions::extend_ttl(&env, &deposit_id);
        positions::extend_instance(&env);
    }

    pub fn get_period_data(env: Env, period: u64) -> Option<Period> {
        env.storage().instance().get(&DataKey::Periods(period))
    }

    pub fn version(env: Env) -> u32 {
        upgrade::version(&env)
    }

    pub fn check_solvency(env: Env) -> Result<(), VaquitaPoolError> {
        accounting::assert_solvent(&env)
    }

    /// Test-only: inflate TotalPrincipal to force an insolvency so tests can
    /// verify ConservationInvariantViolated is returned.
    #[cfg(test)]
    pub fn test_corrupt_total_principal(env: Env, extra: i128) {
        let cur: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalPrincipal)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalPrincipal, &(cur + extra));
    }
}

#[cfg(test)]
mod test;
