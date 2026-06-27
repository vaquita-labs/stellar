import { describe, expect, it } from "vitest";

import {
  buildContractPhaseArtifact,
  parseStellarCliOutput,
  requiredConfirmationForPhase,
  stellarExpertLinks,
} from "./contracts-deployment.js";

describe("contract deployment helpers", () => {
  it("maps guarded phases to explicit confirmation strings", () => {
    expect(requiredConfirmationForPhase("deploy_pool")).toBe("DEPLOY_POOL");
    expect(requiredConfirmationForPhase("deploy_badges")).toBe("DEPLOY_BADGES");
    expect(requiredConfirmationForPhase("smoke")).toBe("RUN_SMOKE");
  });

  it("parses public contract ids and transaction hashes from Stellar CLI output", () => {
    const parsed = parseStellarCliOutput(`
      uploading wasm 4d4f4c7b1c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef
      deployed contract CDX5QB7JOJJQKVYICT4K5PURM73WUOWDMKKHFIHVYUH5HV2RPPL5Q6CM
      transaction 75bf15f7948773d88735c47734b0ac15dbe181d941b401a72b4705259023105e
    `);

    expect(parsed).toEqual({
      contractId: "CDX5QB7JOJJQKVYICT4K5PURM73WUOWDMKKHFIHVYUH5HV2RPPL5Q6CM",
      transactionHash: "75bf15f7948773d88735c47734b0ac15dbe181d941b401a72b4705259023105e",
    });
  });

  it("builds release artifacts without implying app rewire", () => {
    const artifact = buildContractPhaseArtifact({
      phase: "deploy_pool",
      executionMode: "validate_only",
      context: {
        workflowName: "Mainnet Deployment",
        environment: "mainnet",
        network: "mainnet",
        commitSha: "abc123",
        runId: "42",
        actor: "operator",
      },
      wasmHashes: { pool: "wasm-hash" },
      contractIds: { pool: null },
      transactionHashes: { pool: null },
      operatorInputs: {
        admin: "GADMIN",
        defindexVaultId: "CVAULT",
      },
      createdAt: "2026-06-27T00:00:00.000Z",
    });

    expect(artifact.manual_rewire_required).toBe(true);
    expect(artifact.no_automatic_rewire).toBe(true);
    expect(JSON.stringify(artifact)).not.toContain("SECRET");
    expect(artifact.operator_inputs).toEqual({
      admin: "GADMIN",
      defindexVaultId: "CVAULT",
    });
  });

  it("builds Stellar Expert links for public and testnet networks", () => {
    expect(
      stellarExpertLinks({
        network: "mainnet",
        contractId: "CCONTRACT",
        transactionHash: "tx",
      }),
    ).toEqual({
      contract: "https://stellar.expert/explorer/public/contract/CCONTRACT",
      transaction: "https://stellar.expert/explorer/public/tx/tx",
    });

    expect(stellarExpertLinks({ network: "testnet", contractId: null })).toEqual({
      contract: null,
      transaction: null,
    });
  });
});
