#![no_std]
use soroban_sdk::{
    contract, contractimpl, vec, contracttype, Address, Env, String, IntoVal, Vec, Symbol, token::Client as TokenClient,
    auth::{InvokerContractAuthEntry, ContractContext, SubContractInvocation},
};

mod defindex_vault;
mod error;
use defindex_vault::DeFindexVaultClient;

soroban_sdk::contractimport!(file = "src/external_wasms/blend/pool.wasm");
pub type BlendPoolClient<'a> = Client<'a>;
pub const SCALAR_12: i128 = 1_000_000_000_000;

mod test;

// ==================== DATA STRUCTS ====================

#[derive(Clone)]
#[contracttype]
pub struct Position {
    owner: Address,
    amount: i128,
    finalization_time: u64,
    lock_period: u64,
    b_rate: i128,
}

#[derive(Clone)]
#[contracttype]
pub struct Period {
    reward_pool: i128,
    total_deposits: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    BlendToken,
    PoolAddress,
    DeFindexVaultAddress,
    BasisPoints,
    EarlyWithdrawalFee,
    ProtocolFees,
    Positions(String),
    Periods(u64),
    SupportedLockPeriod(u64),
}

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
        pool_address: Address,
        defindex_vault_address: Address,
        lock_periods: Vec<u64>,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::BlendToken, &blend_token);
        env.storage().instance().set(&DataKey::PoolAddress, &pool_address);
        env.storage().instance().set(&DataKey::DeFindexVaultAddress, &defindex_vault_address);
        env.storage().instance().set(&DataKey::BasisPoints, &10000i128);
        env.storage().instance().set(&DataKey::EarlyWithdrawalFee, &0i128);
        env.storage().instance().set(&DataKey::ProtocolFees, &0i128);

        for lp in lock_periods.iter() {
            env.storage().instance().set(&DataKey::SupportedLockPeriod(lp.clone()), &true);
        }
    }

    // ---------- Owner Check ----------
    fn require_owner(env: &Env, caller: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != admin {
            panic!("Not owner");
        }
    }

    // ---------- Deposit ----------
    pub fn deposit(env: Env, caller: Address, deposit_id: String, amount: i128, period: u64) {
        caller.require_auth();

        if amount <= 0 {
            panic!("Invalid amount");
        }
        if env.storage().instance().has(&DataKey::Positions(deposit_id.clone())) {
            panic!("Deposit already exists");
        }
        let supported: bool = env.storage().instance()
            .get(&DataKey::SupportedLockPeriod(period))
            .unwrap_or(false);
        if !supported {
            panic!("Invalid period");
        }

        let blend_token: Address = env.storage().instance().get(&DataKey::BlendToken).unwrap();
        let pool_address: Address = env.storage().instance().get(&DataKey::PoolAddress).unwrap();
        let defindex_vault_address: Address = env.storage().instance().get(&DataKey::DeFindexVaultAddress).unwrap();
        let contract_address = env.current_contract_address();
        let finalization_time = env.ledger().timestamp() + period;

        // Step 1: Pull blend_token from caller to this contract
        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&caller, &contract_address, &amount);

        // Step 2: Authorize vault to pull blend_token from this contract
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

        // Step 3: Deposit into vault
        let defindex_vault_client = DeFindexVaultClient::new(&env, &defindex_vault_address);
        defindex_vault_client.deposit(&amount, &contract_address);

        // Step 4: Record b_rate at deposit time
        let pool_client = BlendPoolClient::new(&env, &pool_address);
        let b_rate = pool_client.get_reserve(&blend_token).data.b_rate;

        let position = Position {
            owner: caller.clone(),
            amount,
            finalization_time,
            lock_period: period,
            b_rate,
        };
        env.storage().instance().set(&DataKey::Positions(deposit_id.clone()), &position);

        let mut period_data: Period = env.storage().instance()
            .get(&DataKey::Periods(period))
            .unwrap_or(Period { reward_pool: 0, total_deposits: 0 });
        period_data.total_deposits += amount;
        env.storage().instance().set(&DataKey::Periods(period), &period_data);

        env.events().publish(
            (Symbol::new(&env, "deposit"), caller),
            (deposit_id, blend_token, amount, b_rate),
        );
    }

    // ---------- Withdraw ----------
    pub fn withdraw(env: Env, caller: Address, deposit_id: String) {
        caller.require_auth();

        let position: Position = env.storage().instance().get(&DataKey::Positions(deposit_id.clone()))
            .unwrap_or_else(|| panic!("Position not found"));

        if caller != position.owner {
            panic!("Not position owner");
        }

        let blend_token: Address = env.storage().instance().get(&DataKey::BlendToken).unwrap();
        let pool_address: Address = env.storage().instance().get(&DataKey::PoolAddress).unwrap();
        let contract_address = env.current_contract_address();

        let pool_client = BlendPoolClient::new(&env, &pool_address);
        let defindex_vault_address: Address = env.storage().instance().get(&DataKey::DeFindexVaultAddress).unwrap();
        let defindex_vault_client = DeFindexVaultClient::new(&env, &defindex_vault_address);

        let current_b_rate = pool_client.get_reserve(&blend_token).data.b_rate;

        // Calculate amount with accrued interest
        let b_tokens = (position.amount * SCALAR_12) / position.b_rate;
        let amount_to_withdraw = (b_tokens * current_b_rate) / SCALAR_12;
        let interest = if amount_to_withdraw > position.amount {
            amount_to_withdraw - position.amount
        } else {
            0
        };

        // Withdraw from vault back to this contract
        defindex_vault_client.withdraw(
            &amount_to_withdraw,
            &contract_address,
            &contract_address,
        );

        let now = env.ledger().timestamp();
        let mut amount_to_transfer = amount_to_withdraw;
        let mut reward: i128 = 0;

        let mut period_data: Period = env.storage().instance()
            .get(&DataKey::Periods(position.lock_period))
            .unwrap_or_else(|| panic!("Period data not found"));

        if now < position.finalization_time {
            // Early withdrawal: fee on interest only
            let early_fee: i128 = env.storage().instance().get(&DataKey::EarlyWithdrawalFee).unwrap();
            let fee_amount = (interest * early_fee) / 10000;
            let remaining_interest = interest - fee_amount;
            let mut protocol_fees: i128 = env.storage().instance().get(&DataKey::ProtocolFees).unwrap();
            protocol_fees += fee_amount;
            env.storage().instance().set(&DataKey::ProtocolFees, &protocol_fees);
            period_data.reward_pool += remaining_interest;
            amount_to_transfer -= interest;
        } else {
            // On-time: principal + interest + reward pool share
            reward = Self::calculate_reward(&period_data, position.amount);
            period_data.reward_pool -= reward;
            amount_to_transfer += reward;
        }

        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&contract_address, &caller, &amount_to_transfer);

        period_data.total_deposits -= position.amount;
        env.storage().instance().set(&DataKey::Periods(position.lock_period), &period_data);
        env.storage().instance().remove(&DataKey::Positions(deposit_id.clone()));

        env.events().publish(
            (Symbol::new(&env, "withdraw"), caller.clone()),
            (deposit_id, blend_token, amount_to_transfer, reward),
        );
    }

    fn calculate_reward(period_data: &Period, amount: i128) -> i128 {
        if period_data.total_deposits == 0 {
            return 0;
        }
        (period_data.reward_pool * amount) / period_data.total_deposits
    }

    // ---------- Owner functions ----------
    pub fn withdraw_protocol_fees(env: Env, caller: Address) {
        caller.require_auth();
        Self::require_owner(&env, caller.clone());
        let blend_token: Address = env.storage().instance().get(&DataKey::BlendToken).unwrap();
        let contract_address = env.current_contract_address();
        let protocol_fees: i128 = env.storage().instance().get(&DataKey::ProtocolFees).unwrap();

        if protocol_fees > 0 {
            let token_client = TokenClient::new(&env, &blend_token);
            token_client.transfer(&contract_address, &caller, &protocol_fees);
            env.storage().instance().set(&DataKey::ProtocolFees, &0i128);
        }
    }

    pub fn add_rewards(env: Env, caller: Address, period: u64, reward_amount: i128) {
        caller.require_auth();
        Self::require_owner(&env, caller.clone());

        let blend_token: Address = env.storage().instance().get(&DataKey::BlendToken).unwrap();
        let contract_address = env.current_contract_address();
        let token_client = TokenClient::new(&env, &blend_token);
        token_client.transfer(&caller, &contract_address, &reward_amount);

        let supported: bool = env.storage().instance().get(&DataKey::SupportedLockPeriod(period)).unwrap_or(false);
        if !supported {
            panic!("Invalid period");
        }
        let mut period_data: Period = env.storage().instance().get(&DataKey::Periods(period)).unwrap_or(Period {
            reward_pool: 0,
            total_deposits: 0,
        });
        period_data.reward_pool += reward_amount;
        env.storage().instance().set(&DataKey::Periods(period), &period_data);
    }

    pub fn update_early_withdrawal_fee(env: Env, caller: Address, new_fee: i128) {
        Self::require_owner(&env, caller);
        let basis_points: i128 = env.storage().instance().get(&DataKey::BasisPoints).unwrap();
        if new_fee > basis_points {
            panic!("Invalid fee");
        }
        env.storage().instance().set(&DataKey::EarlyWithdrawalFee, &new_fee);
    }

    pub fn add_lock_period(env: Env, caller: Address, new_lock_period: u64) {
        Self::require_owner(&env, caller);
        let exists: bool = env.storage().instance().get(&DataKey::SupportedLockPeriod(new_lock_period)).unwrap_or(false);
        if exists {
            panic!("Lock period already supported");
        }
        env.storage().instance().set(&DataKey::SupportedLockPeriod(new_lock_period), &true);
    }

    // ---------- View functions ----------
    pub fn get_position(env: Env, deposit_id: String) -> Option<Position> {
        env.storage().instance().get(&DataKey::Positions(deposit_id))
    }

    pub fn get_period_data(env: Env, period: u64) -> Option<Period> {
        env.storage().instance().get(&DataKey::Periods(period))
    }
}