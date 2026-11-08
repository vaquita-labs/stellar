/**
 * A brand-new Pollar login returns before the Stellar account exists. Signing
 * in that window is refused with SDK_WALLET_NOT_READY. The session challenge
 * that unlocks the nickname (and every other authenticated call) has to wait
 * for the account instead of failing the request.
 */

export type WalletProvisioning = 'READY' | 'CREATING' | 'FAILED' | 'NONE';

export const WALLET_READY_WAIT_MS = 90_000;

export type WalletReadyClient = {
  onWalletStateChange: (cb: (provisioning: WalletProvisioning) => void) => () => void;
};

type WalletSnapshot = { address?: string | null; provisioning?: WalletProvisioning } | null;

/** The slice of PollarClient this wait needs. Kept structural so tests can fake it. */
export type EnsureWalletClient = WalletReadyClient & {
  hasWallet: () => boolean;
  getWallet: () => WalletSnapshot;
  createWallet: () => Promise<unknown>;
  refreshWalletState?: () => Promise<unknown>;
};

export class WalletNotReadyError extends Error {
  constructor(message = 'Your wallet is still being prepared on the network. Try again in a moment.') {
    super(message);
    this.name = 'WalletNotReadyError';
  }
}

/** Pollar refuses signatures until the wallet has one recovery method. */
export class WalletRecoveryRequiredError extends Error {
  constructor(message = 'SDK_WALLET_RECOVERY_REQUIRED') {
    super(message);
    this.name = 'WalletRecoveryRequiredError';
  }
}

export function isWalletRecoveryRequired(error: unknown): boolean {
  if (error instanceof WalletRecoveryRequiredError) return true;
  if (typeof error === 'string') return error.includes('SDK_WALLET_RECOVERY_REQUIRED');
  if (error instanceof Error) return error.message.includes('SDK_WALLET_RECOVERY_REQUIRED');
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; details?: unknown; message?: unknown };
    return [record.code, record.details, record.message].some(
      (value) => typeof value === 'string' && value.includes('SDK_WALLET_RECOVERY_REQUIRED'),
    );
  }
  return false;
}

export class WalletCreateFailedError extends Error {
  constructor(message = 'The wallet could not be created. Sign in again.') {
    super(message);
    this.name = 'WalletCreateFailedError';
  }
}

/**
 * Resolves when the platform wallet can sign. READY returns on the replay.
 * CREATING and NONE wait for the next change: NONE is a signed-in user whose
 * Stellar account has not been created yet, not a wallet that can sign.
 */
export type WaitForWalletReadyOptions = {
  /** Re-read readiness while waiting. Pollar stops its own watch after about a minute. */
  refresh?: () => Promise<unknown>;
  refreshEveryMs?: number;
};

export function waitForWalletReady(
  client: WalletReadyClient,
  timeoutMs = WALLET_READY_WAIT_MS,
  options?: WaitForWalletReadyOptions,
): Promise<void> {
  const refreshEveryMs = options?.refreshEveryMs ?? 3_000;
  return new Promise((resolve, reject) => {
    let stop = () => {};
    let settled = false;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (refreshTimer) clearInterval(refreshTimer);
      // The first value is replayed inside subscribe, before `stop` is assigned.
      queueMicrotask(() => stop());
      settle();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new WalletNotReadyError()));
    }, timeoutMs);

    if (options?.refresh) {
      const refresh = options.refresh;
      refreshTimer = setInterval(() => {
        void refresh().catch(() => undefined);
      }, refreshEveryMs);
    }

    stop = client.onWalletStateChange((provisioning) => {
      if (provisioning === 'READY') finish(resolve);
      else if (provisioning === 'FAILED') finish(() => reject(new WalletCreateFailedError()));
    });
  });
}

/**
 * A new email login can come back with no Stellar address (`provisioning: NONE`)
 * or with an address whose account is still `CREATING`. Either one leaves the
 * app on the boot skeleton, because nothing is authenticated until an address
 * exists, and a signature in that window is `SDK_WALLET_NOT_READY`.
 */
export async function ensureWalletAddress(client: EnsureWalletClient): Promise<void> {
  if (!client.hasWallet()) {
    await client.createWallet();
  }
  const provisioning = client.getWallet()?.provisioning;
  if (provisioning === 'FAILED') throw new WalletCreateFailedError();
  // Absent on sessions from before provisioning existed: an address is already
  // there and there is nothing to wait for.
  if (provisioning == null || provisioning === 'READY') return;
  const refresh = client.refreshWalletState;
  await waitForWalletReady(client, WALLET_READY_WAIT_MS, refresh ? { refresh: () => refresh() } : undefined);
}
