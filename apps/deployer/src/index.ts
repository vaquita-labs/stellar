import { loadConfig } from "./config.js";
import { DefindexApi, DefindexApiError } from "./defindex-api.js";
import { writeVaultIdToDoppler } from "./doppler.js";
import {
  buildVaultDeploymentArtifact,
  createAndSubmitVault,
  getDeploymentContext,
  getExecutionMode,
  shouldWriteVaultIdToDoppler,
  validateDeploymentContext,
  writeDeploymentArtifact,
  type DopplerWriteResult,
  type VaultDeploymentResult,
} from "./deploy-vault.js";

/**
 * Load .env as a fallback for local runs. Vars already present in the
 * environment (e.g. those injected by `doppler run --config <env>`) are NOT
 * overwritten, per Node's documented behavior.
 */
function loadDotEnvIfPresent(): void {
  try {
    process.loadEnvFile();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

const log = {
  step: (n: number, msg: string) => console.log(`\n[${n}/6] ${msg}`),
  info: (msg: string) => console.log(`     ${msg}`),
  ok: (msg: string) => console.log(`     ok: ${msg}`),
  warn: (msg: string) => console.warn(`     warn: ${msg}`),
  fail: (msg: string) => console.error(`     fail: ${msg}`),
};

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const cfg = loadConfig();
  const executionMode = getExecutionMode(process.env);
  const context = getDeploymentContext(process.env);
  validateDeploymentContext({ network: cfg.network.name, env: process.env });

  console.log("vaquita vault deployer");
  console.log(`  mode:     ${executionMode}`);
  console.log(`  env:      ${context.environment}`);
  console.log(`  network:  ${cfg.network.name}`);
  console.log(`  api:      ${cfg.api.baseUrl}`);
  console.log(`  deployer: ${cfg.deployer.public}`);
  console.log(`  vault:    ${cfg.vault.name} (${cfg.vault.symbol}) fee=${cfg.vault.feeBps}bps upgradable=${cfg.vault.upgradable}`);
  console.log(`  roles:`);
  console.log(`    emergency_manager:   ${cfg.roles.emergencyManager}`);
  console.log(`    vault_fee_receiver:  ${cfg.roles.vaultFeeReceiver}`);
  console.log(`    manager:             ${cfg.roles.manager}`);
  console.log(`    rebalance_manager:   ${cfg.roles.rebalanceManager}`);
  console.log(`  assets:`);
  console.log(`    usdc:                ${cfg.assets.usdc}`);
  console.log(`    strategy:            ${cfg.assets.blendUsdcStrategy.address} (name="${cfg.assets.blendUsdcStrategy.name}")`);

  let result: VaultDeploymentResult;
  if (executionMode === "validate_only") {
    log.step(1, "validate configuration only");
    log.ok("configuration and deployment context are valid");
    result = {
      status: "validated",
      vaultId: null,
      txHash: null,
      explorerTxUrl: null,
      explorerVaultUrl: null,
    };
  } else {
    const api = new DefindexApi(cfg);

    log.step(1, "GET /health");
    log.step(2, "POST /factory/create-vault");
    log.step(3, "sign XDR locally");
    log.step(4, "POST /send");
    log.step(5, "extract vault address from returnValue");
    result = await createAndSubmitVault({
      api,
      cfg,
      onCreateVault: (created) => {
        log.ok(
          `received unsigned XDR (${created.xdr.length} chars, simulation=${created.simulation_result ?? "<n/a>"})`,
        );
        log.ok("signed with deployer key (secret never left this process)");
      },
      onSend: (sent) => {
        log.ok(`tx submitted: status=${sent.status} txHash=${sent.txHash}`);
        if (sent.ledger) log.info(`ledger: ${sent.ledger}`);
      },
    });
    log.ok(`vault contract: ${result.vaultId}`);
  }

  let doppler: DopplerWriteResult = {
    attempted: false,
    status: "skipped",
    reason: "validate-only mode or no vault ID yet",
  };
  if (executionMode === "execute" && result.status === "success") {
    log.step(6, "handle VAULT_ID Doppler writeback");
    if (shouldWriteVaultIdToDoppler(process.env)) {
      const written = writeVaultIdToDoppler(result.vaultId);
      doppler = written.ok
        ? {
            attempted: true,
            status: "written",
            project: written.project,
            config: written.config,
          }
        : { attempted: true, status: "failed", reason: written.reason };
      if (written.ok) {
        log.ok(
          `doppler secrets set VAULT_ID=${result.vaultId} --project ${written.project} --config ${written.config}`,
        );
      } else {
        log.warn(written.reason);
        log.warn(
          `VAULT_ID=${result.vaultId} was NOT written to Doppler. Set it manually if required.`,
        );
      }
    } else {
      doppler = {
        attempted: false,
        status: "skipped",
        reason: "WRITE_VAULT_ID_TO_DOPPLER=false",
      };
      log.ok("Doppler writeback skipped by WRITE_VAULT_ID_TO_DOPPLER=false");
    }
  }

  const artifact = buildVaultDeploymentArtifact({
    cfg,
    phase: "deploy_vault",
    executionMode,
    context,
    result,
    doppler,
  });

  if (process.env.DEPLOYMENT_ARTIFACT_PATH) {
    writeDeploymentArtifact(process.env.DEPLOYMENT_ARTIFACT_PATH, artifact);
    log.ok(`deployment artifact written: ${process.env.DEPLOYMENT_ARTIFACT_PATH}`);
  }

  console.log("\nsummary");
  console.log(`  status:   ${artifact.status}`);
  console.log(`  vault:    ${artifact.vault_id ?? "<not created>"}`);
  console.log(`  tx_hash:  ${artifact.tx_hash ?? "<not submitted>"}`);
  console.log(`  rewire:   manual rewire still required`);
  if (artifact.explorer_tx_url) console.log(`  explorer: ${artifact.explorer_tx_url}`);
  if (artifact.explorer_vault_url) console.log(`  explorer: ${artifact.explorer_vault_url}`);
}

main().catch((err: unknown) => {
  console.error("\ndeploy failed");
  if (err instanceof DefindexApiError) {
    console.error(`  ${err.method} ${err.path} -> HTTP ${err.status}`);
    console.error(`  body: ${err.body}`);
  } else if (err instanceof Error) {
    console.error(`  ${err.message}`);
    if (err.stack) console.error(err.stack.split("\n").slice(1).join("\n"));
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
