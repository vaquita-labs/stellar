export type ContractDeploymentPhase = "deploy_pool" | "deploy_badges" | "smoke";
export type ContractExecutionMode = "validate_only" | "execute";

export type ContractPhaseContext = {
  workflowName: string;
  environment: string;
  network: "testnet" | "mainnet";
  commitSha: string;
  runId: string;
  actor: string;
};

export type ContractPhaseArtifact = {
  workflow_name: string;
  phase: ContractDeploymentPhase;
  execution_mode: ContractExecutionMode;
  environment: string;
  network: "testnet" | "mainnet";
  commit_sha: string;
  run_id: string;
  actor: string;
  wasm_hashes: Record<string, string | null>;
  contract_ids: Record<string, string | null>;
  transaction_hashes: Record<string, string | null>;
  explorer_links: Record<string, string | null>;
  operator_inputs: Record<string, unknown>;
  smoke_checks: Record<string, unknown>;
  manual_rewire_required: true;
  no_automatic_rewire: true;
  created_at: string;
};

const contractIdPattern = /\bC[A-Z2-7]{55}\b/g;
const txHashPattern = /\b[0-9a-fA-F]{64}\b/g;

export function requiredConfirmationForPhase(phase: ContractDeploymentPhase): string {
  switch (phase) {
    case "deploy_pool":
      return "DEPLOY_POOL";
    case "deploy_badges":
      return "DEPLOY_BADGES";
    case "smoke":
      return "RUN_SMOKE";
  }
}

export function getContractPhaseContext(env: NodeJS.ProcessEnv): ContractPhaseContext {
  const network = env.NETWORK === "mainnet" ? "mainnet" : "testnet";
  return {
    workflowName: env.GITHUB_WORKFLOW ?? "local-mainnet-deployment",
    environment: env.DEPLOYMENT_ENVIRONMENT ?? env.GITHUB_ENVIRONMENT ?? "local",
    network,
    commitSha: env.GITHUB_SHA ?? "local",
    runId: env.GITHUB_RUN_ID ?? "local",
    actor: env.GITHUB_ACTOR ?? env.USER ?? "local",
  };
}

export function parseStellarCliOutput(output: string): {
  contractId: string | null;
  transactionHash: string | null;
} {
  const contractIds = output.match(contractIdPattern) ?? [];
  const txHashes = output.match(txHashPattern) ?? [];
  return {
    contractId: contractIds.at(-1) ?? null,
    transactionHash: txHashes.at(-1)?.toLowerCase() ?? null,
  };
}

export function stellarExpertLinks(args: {
  network: "testnet" | "mainnet";
  contractId?: string | null;
  transactionHash?: string | null;
}): { contract: string | null; transaction: string | null } {
  const explorerNetwork = args.network === "mainnet" ? "public" : "testnet";
  const host = `https://stellar.expert/explorer/${explorerNetwork}`;
  return {
    contract: args.contractId ? `${host}/contract/${args.contractId}` : null,
    transaction: args.transactionHash ? `${host}/tx/${args.transactionHash}` : null,
  };
}

export function buildContractPhaseArtifact(args: {
  phase: ContractDeploymentPhase;
  executionMode: ContractExecutionMode;
  context: ContractPhaseContext;
  wasmHashes?: Record<string, string | null>;
  contractIds?: Record<string, string | null>;
  transactionHashes?: Record<string, string | null>;
  explorerLinks?: Record<string, string | null>;
  operatorInputs?: Record<string, unknown>;
  smokeChecks?: Record<string, unknown>;
  createdAt?: string;
}): ContractPhaseArtifact {
  return {
    workflow_name: args.context.workflowName,
    phase: args.phase,
    execution_mode: args.executionMode,
    environment: args.context.environment,
    network: args.context.network,
    commit_sha: args.context.commitSha,
    run_id: args.context.runId,
    actor: args.context.actor,
    wasm_hashes: args.wasmHashes ?? {},
    contract_ids: args.contractIds ?? {},
    transaction_hashes: args.transactionHashes ?? {},
    explorer_links: args.explorerLinks ?? {},
    operator_inputs: args.operatorInputs ?? {},
    smoke_checks: args.smokeChecks ?? {},
    manual_rewire_required: true,
    no_automatic_rewire: true,
    created_at: args.createdAt ?? new Date().toISOString(),
  };
}
