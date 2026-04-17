#![cfg(test)]
//! End-to-end Blend Protocol fixture used by integration tests.

use sep_40_oracle::testutils::{Asset, MockPriceOracleClient, MockPriceOracleWASM};
use sep_41_token::testutils::MockTokenClient;
use soroban_sdk::{
    testutils::{Address as _, BytesN as _},
    token::StellarAssetClient,
    vec, Address, BytesN, Env, String, Symbol, Vec,
};

use super::{EnvTestUtils, ONE_DAY_LEDGERS};

// ---------- Contract imports ----------

pub mod comet {
    soroban_sdk::contractimport!(file = "src/external_wasms/blend/comet.wasm");
}

pub mod backstop {
    soroban_sdk::contractimport!(file = "src/external_wasms/blend/backstop.wasm");
}
use backstop::Client as BackstopClient;

pub mod emitter {
    soroban_sdk::contractimport!(file = "src/external_wasms/blend/emitter.wasm");
}

pub mod pool_factory {
    soroban_sdk::contractimport!(file = "src/external_wasms/blend/pool_factory.wasm");
}
use pool_factory::{Client as PoolFactoryClient, PoolInitMeta};

pub mod pool {
    soroban_sdk::contractimport!(file = "src/external_wasms/blend/pool.wasm");
}
use pool::{Client as PoolClient, ReserveConfig, ReserveEmissionMetadata};

// ---------- Deployers ----------

pub fn create_backstop<'a>(
    e: &Env,
    contract_id: &Address,
    backstop_token: &Address,
    emitter: &Address,
    blnd_token: &Address,
    usdc_token: &Address,
    pool_factory: &Address,
    drop_list: &Vec<(Address, i128)>,
) -> BackstopClient<'a> {
    e.register_at(
        contract_id,
        backstop::WASM,
        (
            backstop_token,
            emitter,
            blnd_token,
            usdc_token,
            pool_factory,
            drop_list.clone(),
        ),
    );
    BackstopClient::new(e, contract_id)
}

pub fn create_pool_factory<'a>(
    e: &Env,
    contract_id: &Address,
    pool_init_meta: PoolInitMeta,
) -> PoolFactoryClient<'a> {
    e.register_at(contract_id, pool_factory::WASM, (pool_init_meta,));
    PoolFactoryClient::new(e, contract_id)
}

pub fn create_mock_oracle<'a>(e: &Env) -> (Address, MockPriceOracleClient<'a>) {
    let contract_id = Address::generate(e);
    e.register_at(&contract_id, MockPriceOracleWASM, ());
    (
        contract_id.clone(),
        MockPriceOracleClient::new(e, &contract_id),
    )
}

// ---------- Fixture ----------

/// Fixture for deploying and interacting with the Blend Protocol contracts in Rust tests.
pub struct BlendFixture<'a> {
    pub backstop: backstop::Client<'a>,
    pub emitter: emitter::Client<'a>,
    pub pool_factory: pool_factory::Client<'a>,
}

impl<'a> BlendFixture<'a> {
    /// Deploy a new set of Blend Protocol contracts. Mints 200k backstop tokens to
    /// the deployer that can be used in the future to create up to 4 reward zone pools
    /// (50k tokens each).
    ///
    /// This function also resets the env budget via `reset_unlimited`.
    pub fn deploy(
        env: &Env,
        deployer: &Address,
        blnd: &Address,
        usdc: &Address,
    ) -> BlendFixture<'a> {
        env.cost_estimate().budget().reset_unlimited();
        let backstop_id = Address::generate(env);
        let pool_factory = Address::generate(env);

        let emitter = env.register(emitter::WASM, ());
        let comet = env.register(comet::WASM, ());

        let blnd_client = StellarAssetClient::new(env, blnd);
        let usdc_client = StellarAssetClient::new(env, usdc);
        blnd_client
            .mock_all_auths()
            .mint(deployer, &(1_000_0000000 * 2001));
        usdc_client
            .mock_all_auths()
            .mint(deployer, &(25_0000000 * 2001));

        let comet_client: comet::Client<'a> = comet::Client::new(env, &comet);
        comet_client.mock_all_auths().init(
            deployer,
            &vec![env, blnd.clone(), usdc.clone()],
            &vec![env, 0_8000000, 0_2000000],
            &vec![env, 1_000_0000000, 25_0000000],
            &0_0030000,
        );

        comet_client.mock_all_auths().join_pool(
            &199_900_0000000,
            &vec![env, 1_000_0000000 * 2000, 25_0000000 * 2000],
            deployer,
        );

        blnd_client.mock_all_auths().set_admin(&emitter);
        let emitter_client: emitter::Client<'a> = emitter::Client::new(env, &emitter);
        emitter_client
            .mock_all_auths()
            .initialize(blnd, &backstop_id, &comet);

        let empty_vec: Vec<(Address, i128)> = vec![env];

        let backstop_client = create_backstop(
            env,
            &backstop_id,
            &comet,
            &emitter,
            blnd,
            usdc,
            &pool_factory,
            &empty_vec,
        );

        let pool_hash = env.deployer().upload_contract_wasm(pool::WASM);

        let pool_init_meta = PoolInitMeta {
            backstop: backstop_id.clone(),
            pool_hash: pool_hash.clone(),
            blnd_id: blnd.clone(),
        };

        let pool_factory_client = create_pool_factory(env, &pool_factory.clone(), pool_init_meta);

        backstop_client.distribute();

        BlendFixture {
            backstop: backstop_client,
            emitter: emitter_client,
            pool_factory: pool_factory_client,
        }
    }
}

pub fn create_blend_pool(
    e: &Env,
    blend_fixture: &BlendFixture,
    admin: &Address,
    usdc: &MockTokenClient,
    xlm: &MockTokenClient,
    blnd: &MockTokenClient,
) -> Address {
    usdc.mint(admin, &200_000_0000000);
    xlm.mint(admin, &200_000_0000000);

    let (oracle, oracle_client) = create_mock_oracle(e);
    oracle_client.set_data(
        admin,
        &Asset::Other(Symbol::new(e, "USD")),
        &vec![
            e,
            Asset::Stellar(usdc.address.clone()),
            Asset::Stellar(xlm.address.clone()),
        ],
        &7,
        &300,
    );
    oracle_client.set_price_stable(&vec![e, 1_000_0000i128, 100_0000i128]);

    let salt = BytesN::<32>::random(e);
    let pool = blend_fixture.pool_factory.deploy(
        admin,
        &String::from_str(e, "TEST"),
        &salt,
        &oracle,
        &0,
        &4,
        &1_0000000,
    );
    let pool_client = PoolClient::new(e, &pool);
    blend_fixture
        .backstop
        .deposit(admin, &pool, &20_0000_0000000);

    let reserve_config = ReserveConfig {
        c_factor: 900_0000,
        decimals: 7,
        index: 0,
        l_factor: 900_0000,
        max_util: 900_0000,
        reactivity: 0,
        r_base: 100_0000,
        r_one: 0,
        r_two: 0,
        r_three: 0,
        util: 0,
        supply_cap: 170_141_183_460_469_231_731_687_303_715_884_105_727,
        enabled: true,
    };
    pool_client.queue_set_reserve(&usdc.address, &reserve_config);
    pool_client.set_reserve(&usdc.address);
    pool_client.queue_set_reserve(&xlm.address, &reserve_config);
    pool_client.set_reserve(&xlm.address);

    let emission_config = vec![
        e,
        ReserveEmissionMetadata {
            res_index: 0,
            res_type: 0,
            share: 250_0000,
        },
        ReserveEmissionMetadata {
            res_index: 0,
            res_type: 1,
            share: 250_0000,
        },
        ReserveEmissionMetadata {
            res_index: 1,
            res_type: 0,
            share: 250_0000,
        },
        ReserveEmissionMetadata {
            res_index: 1,
            res_type: 1,
            share: 250_0000,
        },
    ];
    pool_client.set_emissions_config(&emission_config);
    blend_fixture.backstop.add_reward(&pool, &None);

    pool_client.set_status(&0);

    assert_eq!(
        blend_fixture.emitter.get_backstop(),
        blend_fixture.backstop.address
    );
    assert_eq!(blnd.balance(&blend_fixture.backstop.address), 0);

    let start_time = e.ledger().timestamp();
    assert_eq!(
        blend_fixture
            .emitter
            .get_last_distro(&blend_fixture.backstop.address),
        start_time
    );

    e.jump(ONE_DAY_LEDGERS * 7);
    let distribution = blend_fixture.emitter.distribute();
    assert_eq!(distribution, 604800 * 10000000);
    assert_eq!(
        blend_fixture
            .emitter
            .get_last_distro(&blend_fixture.backstop.address),
        start_time + 604800
    );
    assert_eq!(blnd.balance(&blend_fixture.backstop.address), distribution);

    let backstop_distribution = blend_fixture.backstop.distribute();
    assert_eq!(backstop_distribution, 604800 * 10000000);

    let pool_emissions = pool_client.gulp_emissions();
    assert_ne!(pool_emissions, 0);
    pool
}
