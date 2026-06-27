# Mainnet Readiness Runbook

Parent PRD: [Mainnet Pre-Release Readiness PRD](./mainnet-pre-release-readiness-prd.md)

This runbook is the shared operating surface for Vaquita mainnet readiness work. It starts as a scaffold for the pre-release tooling issues and should accumulate exact commands, artifact links, smoke-test outcomes, contract IDs, and operator notes as later issues are implemented.

## Scope Guard

This slice is tooling and documentation only. It does not execute mainnet deployment, fund rewards, rewire runtime app configuration, provision dashboards, or perform any irreversible production action.

Mainnet execution must happen later through explicit human-in-the-loop workflows, protected approvals, and manual checklists. A successful deploy or smoke workflow is not production app cutover.

Out of scope for this PRD and runbook scaffold:

- Mainnet DeFindex vault deployment.
- Mainnet VaquitaPool deployment.
- Mainnet VaquitaBadges deployment.
- Mainnet reward funding.
- Runtime app rewiring in Supabase, GitHub variables, API, web, or admin.
- Grafana Cloud dashboard or alert provisioning.
- PostHog, Vercel Web Analytics, or Vercel Speed Insights setup.
- Automated Dune dashboard provisioning.

## Current Analytics

Umami remains the launch analytics baseline and should stay unchanged during this PRD. Do not add, replace, or remove analytics scripts as part of the mainnet readiness package.

Grafana Cloud is handled by the separate observability PRD and related issues. PostHog, Vercel Web Analytics, and Vercel Speed Insights are excluded from this PRD so launch readiness does not blur into analytics or performance instrumentation changes.

## Required Human Approvals

Protected GitHub Environments are the expected approval boundary for mainnet workflows. Mainnet workflows should be manual `workflow_dispatch` runs, should select the target environment explicitly, and should receive mainnet secrets and variables only from the protected Environment after required reviewers approve the run.

Mainnet operators should confirm before approval:

- The workflow name, phase, target environment, branch, and commit SHA match the intended release.
- The operator-entered inputs match the reviewed release plan.
- The workflow does not include automatic app rewire, dashboard provisioning, reward funding, or contract deployment outside the requested phase.
- The GitHub Environment contains only the secrets and variables required for that phase.
- A rollback or stop condition is documented for the phase being approved.

## Secrets Never In Logs

Workflow steps, scripts, summaries, and uploaded artifacts must never print raw credential values. Use GitHub masking for any value that could appear in command output, and log only stable public identifiers or short fingerprints when needed.

Never log:

- Deployer secret keys or any account seed phrase/secret key.
- DeFindex API keys or API credentials.
- Supabase database URLs, service-role keys, anon keys, or direct Postgres connection strings.
- GitHub tokens.
- VaquitaPool admin keys, VaquitaBadges admin keys, badge signing seeds, or any future signing/admin keys.
- RPC provider credentials when a private endpoint embeds a token.

Allowed public values include contract IDs, vault IDs, transaction hashes, WASM hashes, public account IDs, network passphrases, and Stellar Expert links.

## Release Artifact Convention

Every mainnet readiness workflow should write a GitHub Step Summary and upload machine-readable artifacts. Artifacts should be safe to retain in CI logs and should contain enough context to reconstruct the run without reading raw logs.

Common fields for all workflow summaries and JSON artifacts:

- `workflow_name`
- `phase`
- `environment`
- `network`
- `network_passphrase`
- `commit_sha`
- `branch`
- `run_id`
- `run_attempt`
- `actor`
- `started_at`
- `completed_at`
- `status`
- `inputs`
- `outputs`
- `warnings`
- `manual_followups`
- `secrets_redacted`

Deployment artifacts should also include:

- `wasm_hashes`
- `contract_ids`
- `vault_id`
- `transaction_hashes`
- `stellar_expert_links`
- `constructor_inputs`
- `manual_rewire_required`

Smoke artifacts should also include:

- `checked_contract_ids`
- `read_only_checks`
- `expected_values`
- `observed_values`
- `failed_checks`
- `manual_rewire_required`

Rewards artifacts should also include:

- `pool_contract_id`
- `lock_period`
- `raw_amount`
- `preflight_period`
- `postflight_period`
- `expected_reward_pool_delta`
- `observed_reward_pool_delta`
- `transaction_hash`

Reconciliation artifacts should also include:

- `pool_contract_ids`
- `start_ledger`
- `end_ledger`
- `cursor_before`
- `cursor_after`
- `dry_run`
- `advance_cursor`
- `scanned_event_count`
- `repaired_count`
- `ambiguous_count`
- `skipped_count`
- `error_count`
- `repaired_events`
- `ambiguous_events`

Markdown artifacts should mirror the Step Summary in a durable form. JSON artifacts should contain structured values and must not rely on prose parsing.

## Reconciliation

Owner issue: [043 Config-backed reconciliation dry-run command](../issues/043-config-backed-reconciliation-dry-run-command.md) and [044 Hourly reconciliation repair workflow](../issues/044-hourly-reconciliation-repair-workflow.md)

Purpose:

- Read Stellar mainnet VaquitaPool deposit and withdraw events from Stellar RPC.
- Compare chain events to Supabase-backed application state.
- Repair only unambiguous missed records.
- Report ambiguous records in summaries and artifacts for manual review.
- Store cursor and run state in the existing config table.

Scope guard:

- Dry runs should be the default for manual investigation until operators intentionally enable mutation.
- Scheduled repair must be protected by the target GitHub Environment.
- Reconciliation must not send outbound notifications in this PRD.

Append later:

- Command: `pnpm --filter @vaquita/api reconcile:mainnet -- --start-ledger <ledger> --end-ledger <ledger> --dry-run=true --artifact reconciliation.json`
- Configuration precedence:
  - Pool contract IDs: `--pool-contract-id`, then `VAQUITA_POOL_CONTRACT_IDS`, then `VAQUITA_POOL_CONTRACT_ID`, then project config token `vaquitaContractAddress` values.
  - RPC URL: `--rpc-url`, then `STELLAR_RPC_URL`, then `MAINNET_STELLAR_RPC_URL`.
  - Network passphrase: `--network-passphrase`, then `STELLAR_NETWORK_PASSPHRASE`, then project config `networkPassphrase`.
- Config cursor field: `config.reconciliation_state`.
- Cursor shape: JSON object keyed by job and contract ID. Each cursor stores `lastProcessedLedger`, `lastProcessedEventId`, `lastRunAt`, `lastSuccessAt`, `status`, `errorSummary`, and `counts`.
- Dry-run behavior: reads the cursor but does not apply DB repairs and does not advance `config.reconciliation_state`.
- Artifact shape: JSON includes scanned range, parsed events, parse issues, planned deposit repairs, planned withdrawal repairs, ambiguous events, skipped events, counts, and cursor before/after behavior.
- Scheduled workflow design: use GitHub Actions `environment:` to bind each run to the selected `dev`, `staging`, or `prod` Environment. Use a repository-level allowlist such as `RECONCILIATION_SCHEDULE_ENVIRONMENTS=dev,staging` plus per-Environment `RECONCILIATION_ENABLED=true|false` to control which scheduled jobs actually run.
- Workflow: `.github/workflows/reconcile-vaquita-pool.yml`.
- Schedule: hourly at minute 0.
- Manual dispatch inputs: `target_environment`, `dry_run`, optional `from_ledger`, optional `to_ledger`, and `advance_cursor`.
- Scheduled run behavior:
  - Planner job reads repository variable `RECONCILIATION_SCHEDULE_ENVIRONMENTS`.
  - Scheduled matrix includes only allowed environments.
  - Each matrix job binds `environment: <env>` and checks that Environment's `RECONCILIATION_ENABLED=true` before checkout/install/RPC/DB work.
  - Scheduled jobs pass `--advance-cursor=true`; cursor advancement still happens only when `RECONCILIATION_DRY_RUN=false` because the CLI never advances cursors during dry runs.
- Pause procedure: remove the environment from `RECONCILIATION_SCHEDULE_ENVIRONMENTS` for a repo-level stop, or set that Environment's `RECONCILIATION_ENABLED=false` for an environment-level stop.
- First scheduled run artifact link and summary.
- Ambiguous-event review notes.

## DeFindex Vault Deployment

Owner issue: [045 Guarded DeFindex vault deployment phase](../issues/045-guarded-defindex-vault-deployment-phase.md)

Purpose:

- Add a guarded workflow phase that calls the existing DeFindex REST API deployment path.
- Sign returned XDR locally with a protected deployer key.
- Produce vault ID and transaction hash artifacts for later VaquitaPool deployment.

Scope guard:

- Vault deployment success must not update Supabase app config.
- CI should use GitHub Environment secrets and variables for protected mainnet values.
- Doppler support may remain for local/manual paths, but CI should not require broad Doppler access.

Workflow:

- File: `.github/workflows/mainnet-deployment.yml`.
- Manual phase: `deploy_vault`.
- Default mode: `validate_only`.
- Irreversible mode: `execute`, with `confirm_execute=DEPLOY_VAULT`.
- Artifact: `artifacts/defindex-vault-<selected GitHub Environment>.json`.
- Artifact retention: 30 days.

Required GitHub Environment secrets:

- `DEFINDEX_API_KEY`
- `DEPLOYER_SECRET_KEY`

Required GitHub Environment variables:

- `DEFINDEX_API_URL`
- `DEPLOYER_PUBLIC_KEY`
- `EMERGENCY_MANAGER_ADDRESS`
- `VAULT_FEE_RECEIVER_ADDRESS`
- `MANAGER_ADDRESS`
- `REBALANCE_MANAGER_ADDRESS`
- `VAULT_NAME`
- `VAULT_SYMBOL`
- `VAULT_FEE_BPS`
- `VAULT_UPGRADABLE`
- `BLEND_USDC_STRATEGY_ADDRESS`
- `BLEND_USDC_STRATEGY_NAME`
- `USDC_CONTRACT_ADDRESS`
- `SOROSWAP_ROUTER_ADDRESS`

Mainnet Blend USDC strategy values:

- `BLEND_USDC_STRATEGY_ADDRESS=CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP`
- `BLEND_USDC_STRATEGY_NAME=blend_usdc_autocompound_fixed_strategy`

Before running mainnet:

- Confirm the selected GitHub Environment is protected with required reviewers.
- Run `deploy_vault` in `validate_only` mode first.
- Confirm `DEPLOYER_PUBLIC_KEY` matches `DEPLOYER_SECRET_KEY`; the deployer refuses mismatches.
- Review all role addresses.
- Review `VAULT_FEE_BPS` and `VAULT_UPGRADABLE`.
- Review USDC, Blend USDC strategy, and Soroswap router addresses.
- Select `network=mainnet`; the deployer refuses unsafe mainnet/environment mismatches.
- Confirm CI does not need a Doppler token. The workflow sets `WRITE_VAULT_ID_TO_DOPPLER=false`.

After vault deploy:

- Capture `vault_id` from the Step Summary and uploaded artifact.
- Capture `tx_hash` from the Step Summary and uploaded artifact.
- Open the Stellar Expert vault and transaction links from the artifact.
- Save the artifact link in the release artifact table below.
- Do not update Supabase app config yet.
- Provide the vault ID to the later VaquitaPool deployment phase.

Rollback/abort:

- Vault creation is irreversible once the signed transaction is submitted.
- App cutover has not happened until the later manual rewire phase updates runtime config.
- If validation fails, stop and fix GitHub Environment secrets/vars before attempting `execute`.

## Contract Deployment

Owner issue: [046 Guarded pool and badges deployment and smoke phases](../issues/046-guarded-pool-and-badges-deployment-and-smoke-phases.md)

### VaquitaPool

Purpose:

- Build the reviewed VaquitaPool WASM.
- Deploy with explicit constructor values, including DeFindex vault ID, token address, admin address, lock periods, fee settings, and upgrade timelock.
- Output contract ID, WASM hash, constructor inputs, and transaction hash.

Scope guard:

- The pool deploy phase must require an explicit reviewed vault ID.
- The pool deploy phase must not infer stale values from runtime app config.
- The pool deploy phase must not perform app rewire or user deposit/withdraw tests.

Append later:

- Workflow phase name.
- Required constructor values.
- WASM hash.
- Pool contract ID.
- Deployment transaction hash and Stellar Expert link.
- Artifact path and Step Summary link.

### VaquitaBadges

Purpose:

- Build the reviewed VaquitaBadges WASM.
- Deploy with explicit admin, signing key, and upgrade timelock values.
- Output contract ID, WASM hash, constructor inputs, and transaction hash.

Scope guard:

- Signing seeds and admin secrets must never appear in logs or artifacts.
- The badges deploy phase must not mint production badges.
- The badges deploy phase must not update API/runtime badge contract configuration automatically.

Append later:

- Workflow phase name.
- Required constructor values.
- WASM hash.
- Badges contract ID.
- Deployment transaction hash and Stellar Expert link.
- Artifact path and Step Summary link.

## Smoke Checks

Owner issue: [046 Guarded pool and badges deployment and smoke phases](../issues/046-guarded-pool-and-badges-deployment-and-smoke-phases.md)

Purpose:

- Run read-only checks against deployed mainnet contracts before app rewiring.
- Verify contract existence, version/config getters, paused state where applicable, and expected constructor-derived values.

Scope guard:

- Mainnet smoke checks must not perform user deposits, user withdrawals, badge mints, reward funding, or config rewiring.
- Passing smoke checks only means the deployed contracts are ready for manual rewire review.

Append later:

- Read-only smoke command or workflow phase.
- Expected pool values and observed values.
- Expected badges values and observed values.
- Smoke artifact path and Step Summary link.
- Follow-up findings.

## Manual Rewire Is Separate

Owner issue: [047 Manual post-deploy rewire checklist](../issues/047-manual-post-deploy-rewire-checklist.md)

Deployment and smoke success must not be treated as production app cutover. Runtime rewire is a separate manual checklist after the team reviews deployment artifacts and decides to proceed.

Manual rewire should cover:

- Supabase config rows for network, token, pool, badges, and DeFindex vault values.
- GitHub Environment variables used by operational workflows.
- API config endpoint verification.
- Web and admin app verification.
- Final operator, timestamp, commit SHA, and artifact links.

Append later:

- Exact Supabase config keys to update.
- Required GitHub variable changes.
- API verification commands.
- Web/admin verification checklist.
- Final wired values and verification links.

## Add Rewards

Owner issue: [048 Environment-aware add-rewards workflow](../issues/048-environment-aware-add-rewards-workflow.md)

Purpose:

- Refactor the existing add-rewards workflow into one environment-aware manual path.
- Support dev, staging, and mainnet through explicit environment selection and protected configuration.
- Preflight current period data, invoke `add_rewards`, postflight current period data, and verify the reward pool increased by the expected raw amount.

Scope guard:

- Mainnet reward funding must be protected by GitHub Environment approvals.
- Add-rewards must remain manual-only and must not run on push or schedule.
- Reward funding is not part of this scaffold issue.

Append later:

- Workflow filename and input examples.
- Required environment variables and secrets.
- Preflight/postflight summary shape.
- Mainnet funding transaction hash, only after an approved execution window.
- Artifact path and Step Summary link.

## Dune SQL

Owner issue: [049 Native Stellar mainnet Dune SQL queries](../issues/049-native-stellar-mainnet-dune-sql-queries.md)

Purpose:

- Store repository-owned SQL for launch analytics using Dune native Stellar mainnet data.
- Parameterize contract ID and time-window filters where useful.
- Record final production contract IDs as comments after deployment.

Scope guard:

- Do not extend the existing testnet BYOD ingestion workflow for mainnet public chain events.
- Do not automate Dune dashboard creation in this PRD.
- Do not provision Grafana Cloud dashboards from this runbook.

Append later:

- SQL file path.
- Dune query links if manually created.
- Final pool and badges contract IDs as SQL comments after deployment.
- Known query limitations.

## Release Artifacts

This section is the durable index for mainnet readiness artifacts. Later issues should append rows rather than replacing history.

| Date | Issue | Phase | Environment | Commit SHA | Artifact | Summary | Operator | Status | Notes |
| ---- | ----- | ----- | ----------- | ---------- | -------- | ------- | -------- | ------ | ----- |
| TBD | 043 | reconciliation dry run | TBD | TBD | TBD | TBD | TBD | pending | Append after implementation. |
| TBD | 044 | reconciliation scheduled repair | TBD | TBD | TBD | TBD | TBD | pending | Append after first approved run. |
| TBD | 045 | deploy_vault | TBD | TBD | TBD | TBD | TBD | pending | Append after approved execution. |
| TBD | 046 | deploy_pool | TBD | TBD | TBD | TBD | TBD | pending | Append after approved execution. |
| TBD | 046 | deploy_badges | TBD | TBD | TBD | TBD | TBD | pending | Append after approved execution. |
| TBD | 046 | smoke | TBD | TBD | TBD | TBD | TBD | pending | Append after approved execution. |
| TBD | 047 | manual_rewire | TBD | TBD | TBD | TBD | TBD | pending | Append after manual cutover. |
| TBD | 048 | add_rewards | TBD | TBD | TBD | TBD | TBD | pending | Append only after approved reward funding. |
| TBD | 049 | dune_sql | TBD | TBD | TBD | TBD | TBD | pending | Append after SQL is committed or manually linked. |

## Change Log

| Date | Change | Issue | Operator |
| ---- | ------ | ----- | -------- |
| 2026-06-25 | Created scaffold and scope guard. | 042 | Codex |
