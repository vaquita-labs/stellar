#![cfg(test)]
use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
use crate::test::std::println;
use crate::test::{assert_approx_eq_rel, EnvTestUtils};
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, Vec};

#[test]
fn success() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths_allowing_non_root_auth();
    e.set_default_info();

    let admin = Address::generate(&e);
    let alice = Address::generate(&e);

    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let usdc_client = MockTokenClient::new(&e, &usdc.address());

    let principal: i128 = 200_000_0000000;
    usdc_client.mint(&alice, &principal);

    let defindex_vault_address = e.register(
        MockDeFindexVault,
        MockDeFindexVaultArgs::__constructor(&usdc.address()),
    );

    let lock_periods: Vec<u64> = Vec::from_array(&e, [604800]);
    let vaquita_contract_id = e.register(
        VaquitaPool,
        (
            admin.clone(),
            usdc.address(),
            defindex_vault_address.clone(),
            lock_periods,
            0i128,
            172800u64,
        ),
    );
    let vaquita_client = VaquitaPoolClient::new(&e, &vaquita_contract_id);
    println!("Vaquita pool initialized via constructor");

    vaquita_client.deposit(&alice, &1u64, &principal, &604800);
    println!("Vaquita pool deposited");

    vaquita_client.withdraw(&alice, &1u64);
    println!("Vaquita pool withdrew");

    assert_approx_eq_rel(usdc_client.balance(&alice), principal, 1);
}
