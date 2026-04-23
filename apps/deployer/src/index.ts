import { loadConfig } from "./config.js";
import { DefindexApi, DefindexApiError } from "./defindex-api.js";
import { signTransactionXdr, extractVaultAddress } from "./sign.js";
import { writeVaultIdToDoppler } from "./doppler.js";

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

  console.log("vaquita vault deployer");
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
  console.log(`    soroswap_router:     ${cfg.assets.soroswapRouter}`);

  const dopplerConfig = process.env.DOPPLER_CONFIG;
  if (cfg.network.name === "mainnet" && dopplerConfig !== "mainnet") {
    throw new Error(
      `Refusing to proceed: NETWORK=mainnet but DOPPLER_CONFIG="${dopplerConfig ?? "<unset>"}". Run under \`doppler run --config mainnet\` to deploy to mainnet.`,
    );
  }
  if (cfg.network.name === "testnet" && dopplerConfig && dopplerConfig === "mainnet") {
    throw new Error(
      `Refusing to proceed: NETWORK=testnet but DOPPLER_CONFIG=mainnet. Config mismatch.`,
    );
  }

  const api = new DefindexApi(cfg);

  log.step(1, "GET /health");
  await api.health();
  log.ok("DeFindex API is reachable");

  log.step(2, "POST /factory/create-vault");
  const created = await api.createVault();
  log.ok(`received unsigned XDR (${created.xdr.length} chars, simulation=${created.simulation_result ?? "<n/a>"})`);

  log.step(3, "sign XDR locally");
  const signedXdr = signTransactionXdr(
    created.xdr,
    cfg.deployer.secret,
    cfg.network.passphrase,
  );
  log.ok("signed with deployer key (secret never left this process)");

  log.step(4, "POST /send");
  const sent = await api.send(signedXdr);
  log.ok(`tx submitted: status=${sent.status} txHash=${sent.txHash}`);
  if (sent.ledger) log.info(`ledger: ${sent.ledger}`);

  log.step(5, "extract vault address from returnValue");
  if (!sent.returnValue) {
    throw new Error(`/send response is missing returnValue; cannot determine vault address. Full response: ${JSON.stringify(sent)}`);
  }
  const vaultAddress = extractVaultAddress(sent.returnValue);
  log.ok(`vault contract: ${vaultAddress}`);

  log.step(6, "write VAULT_ID back to Doppler");
  const written = writeVaultIdToDoppler(vaultAddress);
  if (written.ok) {
    log.ok(`doppler secrets set VAULT_ID=${vaultAddress} --project ${written.project} --config ${written.config}`);
  } else {
    log.warn(written.reason);
    log.warn(`VAULT_ID=${vaultAddress} was NOT written to Doppler. Set it manually if required.`);
  }

  const explorerHost =
    cfg.network.name === "mainnet" ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";

  console.log("\nsummary");
  console.log(`  vault:    ${vaultAddress}`);
  console.log(`  tx_hash:  ${sent.txHash}`);
  console.log(`  explorer: ${explorerHost}/tx/${sent.txHash}`);
  console.log(`  explorer: ${explorerHost}/contract/${vaultAddress}`);
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
