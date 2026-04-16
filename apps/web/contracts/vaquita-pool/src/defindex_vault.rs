soroban_sdk::contractimport!(file = "src/external_wasms/blend/defindex_vault.wasm");

#[allow(dead_code)]
pub type DeFindexVaultClient<'a> = Client<'a>;