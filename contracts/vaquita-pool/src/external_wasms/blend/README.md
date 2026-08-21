# DeFindex Vault WASM

This WASM is the compiled DeFindex vault contract used by `vaquita-pool` via
`soroban_sdk::contractimport!`.

| Field          | Value |
|----------------|-------|
| Source repo    | https://github.com/paltalabs/defindex |
| Commit         | (see git log for the commit that introduced this file) |
| Build command  | `cargo build --target wasm32v1-none --release` in the defindex contract workspace |
| SHA-256        | `f345228dca59c6605789620e9ec62ff4847a0927c33dac7581a955fe746016be` |

## Verifying the binary

```bash
sha256sum defindex_vault.wasm
# expected: f345228dca59c6605789620e9ec62ff4847a0927c33dac7581a955fe746016be
```

## Update procedure

1. Build the new WASM from the tagged commit in the source repo.
2. Replace `defindex_vault.wasm` with the new file.
3. Update this README with the new commit hash and SHA-256.
4. Rebuild and test `vaquita-pool` against the new interface.
