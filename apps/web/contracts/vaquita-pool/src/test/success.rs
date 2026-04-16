#![cfg(test)]
use crate::{VaquitaPoolClient, VaquitaPool};
use crate::test::{create_blend_pool, BlendFixture, EnvTestUtils, assert_approx_eq_rel};
use crate::BlendPoolClient;
use crate::Request;
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, MockAuth, MockAuthInvoke, Events};
use soroban_sdk::{vec, Address, Bytes, Env, IntoVal, Symbol, Vec, Val, symbol_short, String, FromVal, log};
use crate::test::std::println;

#[test]
fn success() {
    let e = Env::default();
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths();
    e.set_default_info();

    let admin = Address::generate(&e);
    let alice = Address::generate(&e);

    let blnd = e.register_stellar_asset_contract_v2(admin.clone());
    let usdc = e.register_stellar_asset_contract_v2(admin.clone());
    let xlm = e.register_stellar_asset_contract_v2(admin.clone());
    let blnd_client = MockTokenClient::new(&e, &blnd.address());
    let usdc_client = MockTokenClient::new(&e, &usdc.address());
    let xlm_client = MockTokenClient::new(&e, &xlm.address());

    let blend_fixture = BlendFixture::deploy(&e, &admin, &blnd.address(), &usdc.address());

    let pool = create_blend_pool(&e, &blend_fixture, &admin, &usdc_client, &xlm_client, &blnd_client);
    let pool_client = BlendPoolClient::new(&e, &pool);
    
    // Setup pool util rate
    // admins deposits 200k tokens and borrows 100k tokens for a 50% util rate
    let requests = vec![
        &e,
        Request {
            address: usdc.address().clone(),
            amount: 200_000_0000000,
            request_type: 2,
        },
        Request {
            address: usdc.address().clone(),
            amount: 100_000_0000000,
            request_type: 4,
        },
        Request {
            address: xlm.address().clone(),
            amount: 200_000_0000000,
            request_type: 2,
        },
        Request {
            address: xlm.address().clone(),
            amount: 100_000_0000000,
            request_type: 4,
        },
    ];
    pool_client
        .mock_all_auths()
        .submit(&admin, &admin, &admin, &requests);
    // usdc (0) and xlm (1) charge a fixed 10% borrow rate with 0% backstop take rate
    // admin deposits 200k tokens and borrows 100k tokens for a 50% util rate for every token
    usdc_client.mint(&alice, &200_000_0000000);
    let lock_periods = Vec::from_array(&e, [604800]);

    let vaquita_contract_id = e.register(VaquitaPool, ());
    let vaquita_client = VaquitaPoolClient::new(&e, &vaquita_contract_id);
    vaquita_client.initialize(&admin, &usdc.address(), &pool, &lock_periods);
    println!("Vaquita pool initialized");

    vaquita_client.deposit(&alice, &String::from_str(&e, "TEST"), &200_000_0000000, &604800);
    println!("Vaquita pool deposited");
    
    vaquita_client.withdraw(&alice, &String::from_str(&e, "TEST"));
    println!("Vaquita pool withdrew");
    assert_approx_eq_rel(usdc_client.balance(&alice), 200_000_0000000, 1);
}