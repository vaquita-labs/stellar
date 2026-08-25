# Manual wallet regression — run 2026-08-25-38cdf27

Filled copy of §6 (run header) and §7 (results matrix) of
[`../../wallet-regression-matrix.md`](../../wallet-regression-matrix.md) for this
run. Screenshots referenced by the cells live next to this file.

## Run header

```
Run id:            2026-08-25-38cdf27
Build commit:      38cdf27f3f2503a84bd8f6eb4d73c25918b77243   Branch: dev
Environment URL:   https://app.testnet.development.vaquita.fi
API URL:           https://api.testnet.development.vaquita.fi/api/v1
Network:           testnet             Passphrase: Test SDF Network ; September 2015
Pool contract:     CBXKHWKQRQB6MKYA3DVGCPLUVJ4CPZWJLPB2AGTCOBPON3ZQ3PX64XZG
Badges contract:   CA5G54UMXOTEMF4GTTKA3IP25MN7J5632XNPBPZNGXFBUGQSULCCI3T6
USDC (pool token): CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU
                   issuer GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56
Lock periods:      7 d / 90 d / 180 d   (from GET /api/v1/config)
Feature flags:     PASSIVE_VAULT=<pending>   INSTALL_PROMPT=<pending>
Wallets kit:       @creit.tech/stellar-wallets-kit 2.3.0
Pollar adapter:    @pollar/stellar-wallets-kit-adapter 0.11.2 (@pollar/react 0.11.3-rc.1)
Browser:           Chrome (desktop) — version recorded per cell
Testers:           Oscar Gauss Carvajal Yucra (OGCY)
Test accounts:     freighter GCW3O2ST4R7QC4H47E5J3BXGVSLHOPAPEN4UHIJAYMLFPNTMLD4YBK5U
                   rabet     GBXUOQ63M7L7GAN6CJI6AU7ZXOTAAIHJLYAGUGJA6X6KTPOOKS2PHYX2
Evidence folder:   docs/qa/evidence/2026-08-25-38cdf27/
```

Notes on scope, decided before the run:

- Sign-off case set: `W-01`, `W-04`, `W-05a`, `W-07`, `W-08`, `W-09` — the cases
  that cover the four flows the completion criteria name.
- `W-06` (matured withdrawal) is out of the set: the shortest testnet lock period
  is 7 days, so no position opened in this run can mature. Covered instead by the
  Rust contract tests (R7) and the testnet integration suite (R6).
- Chrome only. Other browsers are nice-to-have and were not run.
- Test accounts are throwaway testnet keypairs funded from the run's distributor
  account `GBF3YVKHFKJQEHE4DHOKURBBQJWLNXC4RB7JS5ZX4DCLVM5D7VVOALYD`
  (Blend testnet faucet). No mainnet key is involved at any point.

## Results matrix

| Wallet · Browser | W-01 | W-04 | W-05a | W-07 | W-08 | W-09 |
|---|---|---|---|---|---|---|
| Freighter · Chrome | | | | | | |
| Albedo · Chrome | | | | | | |
| xBull · Chrome | | | | | | |
| Rabet · Chrome | | | | | | |
| Hana · Chrome | | | | | | |
| Social login · Chrome (control) | N/A | | | | | |

## Per-run tally

| Metric | Value |
|---|---|
| Applicable cells (PASS + FAIL) | |
| PASS | |
| FAIL | |
| Pass rate (PASS ÷ applicable) | |
| Critical FAILs | |
| Open issues | |
| Sign-off (name, date) | |
