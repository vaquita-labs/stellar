export type AdapterId = 'pollar';

export interface WalletAdapter {
  readonly id: AdapterId;
  connect(): Promise<{ address: string } | null>;
  disconnect(): Promise<void>;
  hydrate(): Promise<string | null>;
  getAddress(): string | null;
}
