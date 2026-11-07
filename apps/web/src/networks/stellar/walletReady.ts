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
};

export class WalletNotReadyError extends Error {
  constructor(message = 'Your wallet is still being prepared on the network. Try again in a moment.') {
    super(message);
    this.name = 'WalletNotReadyError';
  }
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
export function waitForWalletReady(
  client: WalletReadyClient,
  timeoutMs = WALLET_READY_WAIT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    let settled = false;

    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // The first value is replayed inside subscribe, before `stop` is assigned.
      queueMicrotask(() => stop());
      settle();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new WalletNotReadyError()));
    }, timeoutMs);

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
  await waitForWalletReady(client);
}
