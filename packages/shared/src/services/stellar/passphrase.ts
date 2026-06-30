import { Networks } from '@stellar/stellar-sdk';

/**
 * Maps a network name to its Stellar passphrase, or null if unrecognized.
 * Accepts the human labels used in config ("Mainnet"/"Testnet") case-insensitively.
 */
export function passphraseForNetwork(network: string | null | undefined): string | null {
  switch (network?.trim().toLowerCase()) {
    case 'mainnet':
    case 'public':
      return Networks.PUBLIC;
    case 'testnet':
      return Networks.TESTNET;
    default:
      return null;
  }
}

/**
 * Resolves the Stellar network passphrase the backend uses to BUILD and VERIFY
 * transactions (challenge auth, badge contract calls, …).
 *
 * A transaction hash mixes in the network passphrase, so signing and verifying
 * must agree on it. `STELLAR_NETWORK` is the single source of truth; the
 * passphrase is always derived from it. Throws if it is unset or unrecognized,
 * so a misconfigured deployment fails fast instead of silently using the wrong
 * network (which breaks wallet-signature verification — the wallet signs with
 * PUBLIC while the server would verify with TESTNET → hash mismatch).
 */
export function resolveNetworkPassphrase(): string {
  const passphrase = passphraseForNetwork(process.env.STELLAR_NETWORK);
  if (passphrase) return passphrase;

  throw new Error(
    'STELLAR_NETWORK is not configured. Set STELLAR_NETWORK=mainnet or ' +
      'STELLAR_NETWORK=testnet in the API environment.',
  );
}
