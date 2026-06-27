import type { Config } from "./config.js";

export type CreateVaultRequest = {
  roles: {
    emergencyManager: string;
    feeReceiver: string;
    manager: string;
    rebalanceManager: string;
  };
  vaultFeeBps: number;
  assets: Array<{
    address: string;
    strategies: Array<{
      address: string;
      name: string;
      paused: boolean;
    }>;
  }>;
  name: string;
  symbol: string;
  upgradable: boolean;
  caller: string;
};

export type CreateVaultResponse = {
  call_params: unknown;
  xdr: string;
  simulation_result?: string;
};

export type SendResponse = {
  status?: string;
  success?: boolean;
  txHash: string;
  returnValue?: string;
  result?: {
    type?: string;
    value?: string | null;
  };
  resultXdr?: string;
  resultMetaXdr?: string;
  envelopeXdr?: string;
  ledger?: number;
  createdAt?: string;
  latestLedger?: number;
  latestLedgerCloseTime?: string;
  feeBump?: boolean;
  feeCharged?: string;
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
    console.log(`     create-vault body: ${JSON.stringify(body)}`);

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
    console.log(`     send body: {"xdr":"<redacted ${signedXdr.length} chars>"}`);
    const res = await this.request<SendResponse>("POST", "/send", { xdr: signedXdr });
    const submitted = res.success === true || res.status === "SUCCESS";
    if (!submitted) {
      throw new Error(
        `/send returned non-success response. success=${String(res.success)} status=${res.status ?? "<unset>"} txHash=${res.txHash ?? "<none>"} body=${JSON.stringify(res)}`,
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
      emergencyManager: cfg.roles.emergencyManager,
      feeReceiver: cfg.roles.vaultFeeReceiver,
      manager: cfg.roles.manager,
      rebalanceManager: cfg.roles.rebalanceManager,
    },
    vaultFeeBps: cfg.vault.feeBps,
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
    name: cfg.vault.name,
    symbol: cfg.vault.symbol,
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
