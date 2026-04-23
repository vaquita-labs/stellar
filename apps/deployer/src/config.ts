import { z } from "zod";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";

const StellarAddress = z
  .string()
  .refine((s) => StrKey.isValidEd25519PublicKey(s) || StrKey.isValidContract(s), {
    message: "must be a valid Stellar G... or contract C... address",
  });

const StellarAccount = z
  .string()
  .refine((s) => StrKey.isValidEd25519PublicKey(s), {
    message: "must be a valid Stellar account (G...)",
  });

const StellarContract = z
  .string()
  .refine((s) => StrKey.isValidContract(s), {
    message: "must be a valid Stellar contract address (C...)",
  });

const StellarSecret = z
  .string()
  .refine((s) => StrKey.isValidEd25519SecretSeed(s), {
    message: "must be a valid Stellar secret (S...)",
  });

const BooleanString = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.enum(["true", "false"]))
  .transform((s) => s === "true");

const PositiveIntString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer")
  .transform((s) => parseInt(s, 10));

const BpsString = PositiveIntString.refine((n) => n >= 0 && n <= 10_000, {
  message: "must be between 0 and 10000 basis points",
});

const Network = z.enum(["testnet", "mainnet"]);

const RawConfig = z.object({
  DEFINDEX_API_KEY: z.string().min(1),
  DEFINDEX_API_URL: z.string().url(),

  DEPLOYER_SECRET_KEY: StellarSecret,
  DEPLOYER_PUBLIC_KEY: StellarAccount,

  EMERGENCY_MANAGER_ADDRESS: StellarAccount,
  VAULT_FEE_RECEIVER_ADDRESS: StellarAccount,
  MANAGER_ADDRESS: StellarAccount,
  REBALANCE_MANAGER_ADDRESS: StellarAccount,

  VAULT_NAME: z.string().min(1).max(64),
  VAULT_SYMBOL: z.string().min(1).max(12),
  VAULT_FEE_BPS: BpsString,
  VAULT_UPGRADABLE: BooleanString,
  NETWORK: Network,

  BLEND_USDC_STRATEGY_ADDRESS: StellarContract,
  BLEND_USDC_STRATEGY_NAME: z.string().min(1).default("blend_usdc"),
  USDC_CONTRACT_ADDRESS: StellarContract,
  SOROSWAP_ROUTER_ADDRESS: StellarContract,
});

export type Config = {
  api: {
    key: string;
    baseUrl: string;
  };
  deployer: {
    secret: string;
    public: string;
  };
  roles: {
    emergencyManager: string;
    vaultFeeReceiver: string;
    manager: string;
    rebalanceManager: string;
  };
  vault: {
    name: string;
    symbol: string;
    feeBps: number;
    upgradable: boolean;
  };
  network: {
    name: "testnet" | "mainnet";
    passphrase: string;
  };
  assets: {
    usdc: string;
    blendUsdcStrategy: { address: string; name: string };
    soroswapRouter: string;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = RawConfig.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid deployer configuration:\n${issues}`);
  }
  const c = parsed.data;

  const derivedPublic = Keypair.fromSecret(c.DEPLOYER_SECRET_KEY).publicKey();
  if (derivedPublic !== c.DEPLOYER_PUBLIC_KEY) {
    throw new Error(
      `DEPLOYER_PUBLIC_KEY (${c.DEPLOYER_PUBLIC_KEY}) does not match the public key derived from DEPLOYER_SECRET_KEY (${derivedPublic}). Refusing to proceed.`,
    );
  }

  return {
    api: { key: c.DEFINDEX_API_KEY, baseUrl: c.DEFINDEX_API_URL.replace(/\/$/, "") },
    deployer: { secret: c.DEPLOYER_SECRET_KEY, public: c.DEPLOYER_PUBLIC_KEY },
    roles: {
      emergencyManager: c.EMERGENCY_MANAGER_ADDRESS,
      vaultFeeReceiver: c.VAULT_FEE_RECEIVER_ADDRESS,
      manager: c.MANAGER_ADDRESS,
      rebalanceManager: c.REBALANCE_MANAGER_ADDRESS,
    },
    vault: {
      name: c.VAULT_NAME,
      symbol: c.VAULT_SYMBOL,
      feeBps: c.VAULT_FEE_BPS,
      upgradable: c.VAULT_UPGRADABLE,
    },
    network: {
      name: c.NETWORK,
      passphrase: c.NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET,
    },
    assets: {
      usdc: c.USDC_CONTRACT_ADDRESS,
      blendUsdcStrategy: {
        address: c.BLEND_USDC_STRATEGY_ADDRESS,
        name: c.BLEND_USDC_STRATEGY_NAME,
      },
      soroswapRouter: c.SOROSWAP_ROUTER_ADDRESS,
    },
  };
}

export { StellarAddress };
