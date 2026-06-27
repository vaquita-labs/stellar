import { afterEach, describe, expect, it, vi } from "vitest";

import { DefindexApi, buildCreateVaultRequest } from "./defindex-api.js";
import type { Config } from "./config.js";

const roleAddress = "GDDPTHEUN2BPZGZZXLU77YRQA6M5YT4ESXRNRZTA6Y72IRCPOQK4GFAF";

function config(overrides: Partial<Config> = {}): Config {
  return {
    api: { key: "redacted", baseUrl: "https://api.defindex.io" },
    deployer: { secret: "redacted", public: roleAddress },
    roles: {
      emergencyManager: roleAddress,
      vaultFeeReceiver: roleAddress,
      manager: roleAddress,
      rebalanceManager: roleAddress,
    },
    vault: {
      name: "BlendUsdc",
      symbol: "BUSDC",
      feeBps: 100,
      upgradable: true,
    },
    network: {
      name: "testnet",
      passphrase: "Test SDF Network ; September 2015",
    },
    assets: {
      usdc: "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU",
      blendUsdcStrategy: {
        address: "CALLOM5I7XLQPPOPQMYAHUWW4N7O3JKT42KQ4ASEEVBXDJQNJOALFSUY",
        name: "test_strategy_blend_usdc",
      },
    },
    ...overrides,
  };
}

describe("buildCreateVaultRequest", () => {
  it("builds the DeFindex vault request with the USDC asset and Blend USDC strategy", () => {
    expect(buildCreateVaultRequest(config())).toMatchObject({
      roles: {
        emergencyManager: roleAddress,
        feeReceiver: roleAddress,
        manager: roleAddress,
        rebalanceManager: roleAddress,
      },
      vaultFeeBps: 100,
      assets: [
        {
          address: "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU",
          strategies: [
            {
              address: "CALLOM5I7XLQPPOPQMYAHUWW4N7O3JKT42KQ4ASEEVBXDJQNJOALFSUY",
              name: "test_strategy_blend_usdc",
              paused: false,
            },
          ],
        },
      ],
      name: "BlendUsdc",
      symbol: "BUSDC",
      upgradable: true,
      caller: roleAddress,
    });
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("name_symbol");
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("vault_fee");
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("vaultFee");
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("vault_fee_bps");
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("soroswap_router");
  });

  it("uses the mainnet Blend USDC autocompound fixed strategy address from config", () => {
    const request = buildCreateVaultRequest(
      config({
        network: {
          name: "mainnet",
          passphrase: "Public Global Stellar Network ; September 2015",
        },
        assets: {
          usdc: "CUSDCMAINNET",
          blendUsdcStrategy: {
            address: "CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP",
            name: "blend_usdc_autocompound_fixed_strategy",
          },
        },
      }),
    );

    expect(request.assets).toEqual([
      {
        address: "CUSDCMAINNET",
        strategies: [
          {
            address: "CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP",
            name: "blend_usdc_autocompound_fixed_strategy",
            paused: false,
          },
        ],
      },
    ]);
  });
});

describe("DefindexApi.send", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the documented success=true send response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          txHash: "75bf15f7948773d88735c47734b0ac15dbe181d941b401a72b4705259023105e",
          success: true,
          result: { type: "Address", value: "CVAULT" },
          ledger: 123,
          createdAt: "2026-06-27T00:00:00.000Z",
          latestLedger: 124,
          latestLedgerCloseTime: "2026-06-27T00:00:05.000Z",
          feeBump: true,
          feeCharged: "100",
        }),
    } as Response);

    const api = new DefindexApi(config());
    await expect(api.send("signed-xdr")).resolves.toMatchObject({
      success: true,
      txHash: "75bf15f7948773d88735c47734b0ac15dbe181d941b401a72b4705259023105e",
      result: { value: "CVAULT" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.defindex.io/send?network=testnet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ xdr: "signed-xdr" }),
      }),
    );
  });
});
