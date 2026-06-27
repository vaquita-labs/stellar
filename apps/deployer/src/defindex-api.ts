import type { Config } from "./config.js";

export type CreateVaultRequest = {
  roles: Record<"0" | "1" | "2" | "3", string>;
  vault_fee_bps: number;
  assets: Array<{
    address: string;
    strategies: Array<{
      address: string;
      name: string;
      paused: boolean;
    }>;
  }>;
  name_symbol: { name: string; symbol: string };
  upgradable: boolean;
  caller: string;
};

export type CreateVaultResponse = {
  call_params: unknown;
  xdr: string;
  simulation_result?: string;
};

export type SendResponse = {
  status: string;
  txHash: string;
  returnValue?: string;
  resultXdr?: string;
  resultMetaXdr?: string;
  envelopeXdr?: string;
  ledger?: number;
  createdAt?: string;
};

export class DefindexApi {
  constructor(private readonly cfg: Config) {}

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const joiner = path.includes("?") ? "&" : "?";
    const url = `${this.cfg.api.baseUrl}${path}${joiner}network=${this.cfg.network.name}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.api.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new DefindexApiError(method, path, res.status, text);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`[${method} ${path}] response is not JSON: ${text.slice(0, 300)}`);
    }
  }

  async health(): Promise<void> {
    await this.request("GET", "/health");
  }

  async createVault(): Promise<CreateVaultResponse> {
    const body = buildCreateVaultRequest(this.cfg);

    const res = await this.request<CreateVaultResponse>(
      "POST",
      "/factory/create-vault",
      body,
    );

    if (!res.xdr || typeof res.xdr !== "string") {
      throw new Error(`create-vault response missing xdr field: ${JSON.stringify(res)}`);
    }
    if (res.simulation_result && res.simulation_result !== "SUCCESS") {
      throw new Error(`create-vault simulation failed: ${res.simulation_result}`);
    }
    return res;
  }

  async send(signedXdr: string): Promise<SendResponse> {
    const res = await this.request<SendResponse>("POST", "/send", { xdr: signedXdr });
    if (res.status !== "SUCCESS") {
      throw new Error(
        `/send returned non-success status "${res.status}". txHash=${res.txHash ?? "<none>"}`,
      );
    }
    if (!res.txHash) {
      throw new Error(`/send response missing txHash: ${JSON.stringify(res)}`);
    }
    return res;
  }
}

export function buildCreateVaultRequest(cfg: Config): CreateVaultRequest {
  return {
    roles: {
      "0": cfg.roles.emergencyManager,
      "1": cfg.roles.vaultFeeReceiver,
      "2": cfg.roles.manager,
      "3": cfg.roles.rebalanceManager,
    },
    vault_fee_bps: cfg.vault.feeBps,
    assets: [
      {
        address: cfg.assets.usdc,
        strategies: [
          {
            address: cfg.assets.blendUsdcStrategy.address,
            name: cfg.assets.blendUsdcStrategy.name,
            paused: false,
          },
        ],
      },
    ],
    name_symbol: { name: cfg.vault.name, symbol: cfg.vault.symbol },
    upgradable: cfg.vault.upgradable,
    caller: cfg.deployer.public,
  };
}

export class DefindexApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`[${method} ${path}] HTTP ${status}: ${body.slice(0, 500)}`);
    this.name = "DefindexApiError";
  }
}
