import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Config } from "./config.js";
import type {
  CreateVaultResponse,
  DefindexApi,
  SendResponse,
} from "./defindex-api.js";
import { extractVaultAddress, signTransactionXdr } from "./sign.js";

export type DeploymentPhase = "deploy_vault";
export type ExecutionMode = "validate_only" | "execute";

export type DeploymentContext = {
  environment: string;
  workflowName: string;
  commitSha: string;
  runId: string;
  actor: string;
};

export type DopplerWriteResult = {
  attempted: boolean;
  status: "written" | "skipped" | "failed";
  reason?: string;
  project?: string;
  config?: string;
};

export type VaultDeploymentResult =
  | {
      status: "validated";
      vaultId: null;
      txHash: null;
      explorerTxUrl: null;
      explorerVaultUrl: null;
    }
  | {
      status: "success";
      vaultId: string;
      txHash: string;
      ledger?: number;
      explorerTxUrl: string;
      explorerVaultUrl: string;
    };

export type VaultDeploymentArtifact = {
  workflow_name: string;
  phase: DeploymentPhase;
  execution_mode: ExecutionMode;
  environment: string;
  network: Config["network"]["name"];
  network_passphrase: string;
  commit_sha: string;
  run_id: string;
  actor: string;
  deployer_public_key: string;
  roles: Config["roles"];
  vault: Config["vault"];
  assets: Config["assets"];
  api_base_url: string;
  status: VaultDeploymentResult["status"];
  vault_id: string | null;
  tx_hash: string | null;
  ledger?: number;
  explorer_tx_url: string | null;
  explorer_vault_url: string | null;
  manual_rewire_required: true;
  no_automatic_rewire: true;
  doppler: DopplerWriteResult;
  created_at: string;
};

export function getExecutionMode(env: NodeJS.ProcessEnv): ExecutionMode {
  return env.DEPLOYER_VALIDATE_ONLY === "true" ? "validate_only" : "execute";
}

export function getDeploymentContext(env: NodeJS.ProcessEnv): DeploymentContext {
  return {
    environment:
      env.DEPLOYMENT_ENVIRONMENT ??
      env.GITHUB_ENVIRONMENT ??
      env.DOPPLER_CONFIG ??
      "local",
    workflowName: env.GITHUB_WORKFLOW ?? "local-defindex-vault-deploy",
    commitSha: env.GITHUB_SHA ?? "local",
    runId: env.GITHUB_RUN_ID ?? "local",
    actor: env.GITHUB_ACTOR ?? env.USER ?? "local",
  };
}

export function validateDeploymentContext(args: {
  network: Config["network"]["name"];
  env: NodeJS.ProcessEnv;
}): void {
  const deploymentEnvironment =
    args.env.DEPLOYMENT_ENVIRONMENT ?? args.env.GITHUB_ENVIRONMENT;
  const dopplerConfig = args.env.DOPPLER_CONFIG;
  const selected = deploymentEnvironment?.toLowerCase();
  const mainnetEnvironments = new Set(["mainnet", "prod", "production"]);

  if (args.network === "mainnet") {
    if (selected && !mainnetEnvironments.has(selected)) {
      throw new Error(
        `Refusing to proceed: NETWORK=mainnet but DEPLOYMENT_ENVIRONMENT="${deploymentEnvironment}". Select a mainnet/prod GitHub Environment.`,
      );
    }

    if (!selected && dopplerConfig !== "mainnet") {
      throw new Error(
        `Refusing to proceed: NETWORK=mainnet but no mainnet GitHub Environment or DOPPLER_CONFIG=mainnet was detected.`,
      );
    }
  }

  if (args.network === "testnet") {
    if (selected && mainnetEnvironments.has(selected)) {
      throw new Error(
        `Refusing to proceed: NETWORK=testnet but DEPLOYMENT_ENVIRONMENT="${deploymentEnvironment}". Config mismatch.`,
      );
    }

    if (dopplerConfig === "mainnet") {
      throw new Error(
        "Refusing to proceed: NETWORK=testnet but DOPPLER_CONFIG=mainnet. Config mismatch.",
      );
    }
  }
}

export function shouldWriteVaultIdToDoppler(env: NodeJS.ProcessEnv): boolean {
  return env.WRITE_VAULT_ID_TO_DOPPLER !== "false";
}

export function buildExplorerUrls(args: {
  network: Config["network"]["name"];
  vaultId: string;
  txHash: string;
}): { explorerTxUrl: string; explorerVaultUrl: string } {
  const explorerHost =
    args.network === "mainnet"
      ? "https://stellar.expert/explorer/public"
      : "https://stellar.expert/explorer/testnet";

  return {
    explorerTxUrl: `${explorerHost}/tx/${args.txHash}`,
    explorerVaultUrl: `${explorerHost}/contract/${args.vaultId}`,
  };
}

export function buildVaultDeploymentArtifact(args: {
  cfg: Config;
  phase: DeploymentPhase;
  executionMode: ExecutionMode;
  context: DeploymentContext;
  result: VaultDeploymentResult;
  doppler: DopplerWriteResult;
  createdAt?: string;
}): VaultDeploymentArtifact {
  return {
    workflow_name: args.context.workflowName,
    phase: args.phase,
    execution_mode: args.executionMode,
    environment: args.context.environment,
    network: args.cfg.network.name,
    network_passphrase: args.cfg.network.passphrase,
    commit_sha: args.context.commitSha,
    run_id: args.context.runId,
    actor: args.context.actor,
    deployer_public_key: args.cfg.deployer.public,
    roles: args.cfg.roles,
    vault: args.cfg.vault,
    assets: args.cfg.assets,
    api_base_url: args.cfg.api.baseUrl,
    status: args.result.status,
    vault_id: args.result.vaultId,
    tx_hash: args.result.txHash,
    ...(args.result.status === "success" && args.result.ledger
      ? { ledger: args.result.ledger }
      : {}),
    explorer_tx_url: args.result.explorerTxUrl,
    explorer_vault_url: args.result.explorerVaultUrl,
    manual_rewire_required: true,
    no_automatic_rewire: true,
    doppler: args.doppler,
    created_at: args.createdAt ?? new Date().toISOString(),
  };
}

export function writeDeploymentArtifact(
  artifactPath: string,
  artifact: VaultDeploymentArtifact,
): void {
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(`${artifactPath}.tmp`, `${JSON.stringify(artifact, null, 2)}\n`);
  renameSync(`${artifactPath}.tmp`, artifactPath);
}

export async function createAndSubmitVault(args: {
  api: DefindexApi;
  cfg: Config;
  onCreateVault?: (created: CreateVaultResponse) => void;
  onSend?: (sent: SendResponse) => void;
}): Promise<VaultDeploymentResult> {
  await args.api.health();
  const created = await args.api.createVault();
  args.onCreateVault?.(created);

  const signedXdr = signTransactionXdr(
    created.xdr,
    args.cfg.deployer.secret,
    args.cfg.network.passphrase,
  );

  const sent = await args.api.send(signedXdr);
  args.onSend?.(sent);
  if (!sent.returnValue) {
    throw new Error(
      `/send response is missing returnValue; cannot determine vault address. Full response: ${JSON.stringify(sent)}`,
    );
  }

  const vaultId = extractVaultAddress(sent.returnValue);
  return {
    status: "success",
    vaultId,
    txHash: sent.txHash,
    ...(sent.ledger ? { ledger: sent.ledger } : {}),
    ...buildExplorerUrls({
      network: args.cfg.network.name,
      vaultId,
      txHash: sent.txHash,
    }),
  };
}
