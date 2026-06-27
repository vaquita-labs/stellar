import { describe, expect, it } from "vitest";

import { buildCreateVaultRequest } from "./defindex-api.js";
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
      soroswapRouter: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
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
      vaultFee: 100,
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
      soroswap_router: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      name: "BlendUsdc",
      symbol: "BUSDC",
      upgradable: true,
      caller: roleAddress,
    });
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("name_symbol");
    expect(buildCreateVaultRequest(config())).not.toHaveProperty("vault_fee_bps");
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
          soroswapRouter: "CSOROSWAPMAINNET",
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
