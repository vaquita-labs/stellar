import { describe, expect, it } from "vitest";

import {
  buildVaultDeploymentArtifact,
  validateDeploymentContext,
} from "./deploy-vault.js";

const baseEnv = {
  GITHUB_WORKFLOW: "Mainnet Deployment",
  GITHUB_SHA: "abc123",
  GITHUB_RUN_ID: "42",
  GITHUB_ACTOR: "operator",
};

describe("validateDeploymentContext", () => {
  it.each([
    ["dev", "testnet"],
    ["dev", "mainnet"],
    ["staging", "testnet"],
    ["staging", "mainnet"],
    ["prod", "testnet"],
    ["prod", "mainnet"],
  ] as const)("allows %s deployments on %s", (environment, network) => {
    expect(() =>
      validateDeploymentContext({
        network,
        env: {
          ...baseEnv,
          DEPLOYMENT_ENVIRONMENT: environment,
        },
      }),
    ).not.toThrow();
  });

  it("refuses unknown deployment environments", () => {
    expect(() =>
      validateDeploymentContext({
        network: "testnet",
        env: {
          ...baseEnv,
          DEPLOYMENT_ENVIRONMENT: "preview",
        },
      }),
    ).toThrow(/dev, staging, or prod/);
  });
});

describe("buildVaultDeploymentArtifact", () => {
  it("records only public deployment details and keeps manual rewire required", () => {
    const artifact = buildVaultDeploymentArtifact({
      cfg: {
        api: { key: "secret-api-key", baseUrl: "https://api.defindex.io" },
        deployer: {
          secret: "secret-seed",
          public: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        },
        roles: {
          emergencyManager: "GEMERGENCY",
          vaultFeeReceiver: "GFEE",
          manager: "GMANAGER",
          rebalanceManager: "GREBALANCE",
        },
        vault: {
          name: "Vaquita USDC",
          symbol: "vUSDC",
          feeBps: 100,
          upgradable: true,
        },
        network: {
          name: "mainnet",
          passphrase: "Public Global Stellar Network ; September 2015",
        },
        assets: {
          usdc: "CUSDC",
          blendUsdcStrategy: { address: "CBLEND", name: "blend_usdc" },
        },
      },
      phase: "deploy_vault",
      executionMode: "execute",
      context: {
        environment: "mainnet",
        workflowName: "Mainnet Deployment",
        commitSha: "abc123",
        runId: "42",
        actor: "operator",
      },
      result: {
        status: "success",
        vaultId: "CVAULT",
        txHash: "txhash",
        explorerTxUrl: "https://stellar.expert/explorer/public/tx/txhash",
        explorerVaultUrl: "https://stellar.expert/explorer/public/contract/CVAULT",
      },
      doppler: { attempted: false, status: "skipped", reason: "disabled" },
    });

    expect(JSON.stringify(artifact)).not.toContain("secret-api-key");
    expect(JSON.stringify(artifact)).not.toContain("secret-seed");
    expect(artifact.manual_rewire_required).toBe(true);
    expect(artifact.no_automatic_rewire).toBe(true);
    expect(artifact.vault_id).toBe("CVAULT");
    expect(artifact.tx_hash).toBe("txhash");
  });
});
