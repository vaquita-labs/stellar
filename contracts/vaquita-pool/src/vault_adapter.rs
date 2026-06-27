use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    vec, Address, Env, IntoVal, Symbol, Vec,
};

use crate::arithmetic;
use crate::defindex_vault::DeFindexVaultClient;
use crate::error::VaquitaPoolError;
use crate::types::DataKey;

/// Deposit `amount` into the DeFindex vault on behalf of the pool contract.
/// Returns the number of vault shares minted.
pub fn deposit_into_vault(
    env: &Env,
    blend_token: &Address,
    defindex_vault_address: &Address,
    amount: i128,
) -> Result<i128, VaquitaPoolError> {
    let contract_address = env.current_contract_address();
    let defindex_vault_client = DeFindexVaultClient::new(env, defindex_vault_address);
    let shares_before = defindex_vault_client.balance(&contract_address);

    env.authorize_as_current_contract(vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: blend_token.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args: vec![
                    env,
                    contract_address.clone().into_val(env),
                    defindex_vault_address.clone().into_val(env),
                    amount.into_val(env),
                ],
            },
            sub_invocations: vec![env],
        }),
    ]);

    let amounts_desired: Vec<i128> = vec![env, amount];
    let amounts_min: Vec<i128> = vec![env, amount];
    defindex_vault_client.deposit(&amounts_desired, &amounts_min, &contract_address, &true);

    let shares_after = defindex_vault_client.balance(&contract_address);
    if shares_after < shares_before {
        return Err(VaquitaPoolError::VaultShareBalanceDecreased);
    }
    let shares = arithmetic::checked_sub(shares_after, shares_before)?;
    if shares <= 0 {
        return Err(VaquitaPoolError::VaultReturnedZeroShares);
    }
    Ok(shares)
}

/// Withdraw `shares` from the DeFindex vault on behalf of the pool contract.
/// DeFindex shares can redeem to more or less than the original principal due
/// to strategy accounting, fees, rounding, or losses. Preview the current asset
/// amount for the shares and use that value as the vault minimum so we redeem
/// the position's actual share value instead of assuming shares == principal.
pub fn withdraw_from_vault(
    env: &Env,
    defindex_vault_address: &Address,
    shares: i128,
) -> Result<i128, VaquitaPoolError> {
    let contract_address = env.current_contract_address();
    let defindex_vault_client = DeFindexVaultClient::new(env, defindex_vault_address);
    let preview_amounts = defindex_vault_client.get_asset_amounts_per_shares(&shares);
    let min_amount = preview_amounts.get_unchecked(0);
    let withdrawn_amounts =
        defindex_vault_client.withdraw(&shares, &vec![env, min_amount], &contract_address);
    let gross = withdrawn_amounts.get_unchecked(0);
    if gross < min_amount {
        return Err(VaquitaPoolError::VaultReturnedLessThanPrincipal);
    }
    Ok(gross)
}

/// Update the DeFindex vault address. Blocked while any positions are open.
pub fn set_vault_address(env: &Env, new_vault: Address) -> Result<(), VaquitaPoolError> {
    crate::admin::require_owner(env)?;
    if crate::positions::outstanding_count(env) > 0 {
        return Err(VaquitaPoolError::VaultRepointHasOutstandingPositions);
    }
    let old_vault: Address = env
        .storage()
        .instance()
        .get(&DataKey::DeFindexVaultAddress)
        .ok_or(VaquitaPoolError::NotInitialized)?;
    env.storage()
        .instance()
        .set(&DataKey::DeFindexVaultAddress, &new_vault);
    crate::events::emit_defindex_vault_updated(env, old_vault, new_vault);
    Ok(())
}
