#![cfg(test)]
use crate::test::mock_defindex_vault::{MockDeFindexVault, MockDeFindexVaultArgs};
use crate::test::std::println;
use crate::test::{assert_approx_eq_rel, EnvTestUtils};
use crate::{VaquitaPool, VaquitaPoolClient};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, Env, String, Vec};

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
    let vaquita_contract_id = e.register(VaquitaPool, ());
    let vaquita_client = VaquitaPoolClient::new(&e, &vaquita_contract_id);
    vaquita_client.initialize(&admin, &usdc.address(), &defindex_vault_address, &lock_periods);
    println!("Vaquita pool initialized");

    vaquita_client.deposit(&alice, &String::from_str(&e, "TEST"), &principal, &604800);
    println!("Vaquita pool deposited");

    vaquita_client.withdraw(&alice, &String::from_str(&e, "TEST"));
    println!("Vaquita pool withdrew");

    assert_approx_eq_rel(usdc_client.balance(&alice), principal, 1);
}
