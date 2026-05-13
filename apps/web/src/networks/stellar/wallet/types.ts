export type AdapterId = 'stellar-wallets-kit' | 'pollar';

export interface SignOpts {
  address: string;
  networkPassphrase: string;
}

export interface SubmitResult {
  hash: string;
}

export interface WalletAdapter {
  readonly id: AdapterId;

  /** Whether this adapter can sign Soroban auth entries. */
  readonly canSignAuthEntry: boolean;

  /**
   * Whether `signTransaction` already submits the transaction to the network.
   * When true, the caller must use `signAndSubmitTransaction` instead and skip its own RPC submit.
   */
  readonly submitsOnSign: boolean;

  connect(): Promise<{ address: string } | null>;
  disconnect(): Promise<void>;
  hydrate(): Promise<string | null>;
  getAddress(): string | null;

  /** Sign-only flow: returns the signed XDR for the caller to submit. */
  signTransaction(xdr: string, opts: SignOpts): Promise<string>;

  /** Combined sign+submit flow. Only implemented by adapters with `submitsOnSign === true`. */
  signAndSubmitTransaction?(xdr: string, opts: SignOpts): Promise<SubmitResult>;

  /** Optional Soroban auth entry signing. */
  signAuthEntry?(authXdr: string, opts: SignOpts): Promise<string>;
}