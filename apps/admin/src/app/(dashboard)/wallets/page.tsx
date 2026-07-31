'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { Button, Card, Input } from '@vaquita/ui';
import { useState } from 'react';

interface WalletResult {
  wallet: string;
  network: string;
  blendUsdc: number;
  vaultUsdc: number;
  total: number;
}

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 7 });

export default function WalletsPage() {
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WalletResult | null>(null);

  const search = async () => {
    const addr = wallet.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/wallets/onchain?wallet=${encodeURIComponent(addr)}`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Lookup failed');
      setResult(data.data as WalletResult);
    } catch (e) {
      setError((e as Error)?.message ?? 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Wallets</h1>
      <p className="text-sm text-gray-500 mb-4">
        Look up a wallet&apos;s on-chain Blend and DeFindex vault USDC.
      </p>

      <div className="flex items-start gap-2 mb-6">
        <Input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
          placeholder="Wallet address (G… or C…)"
          containerClassName="flex-1"
        />
        <Button onPress={() => void search()} isDisabled={loading || !wallet.trim()} isLoading={loading}>
          Search
        </Button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {result && (
        <Card className="p-4">
          <p className="text-xs text-gray-500 break-all mb-3">
            {result.wallet} · {result.network}
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500">Blend</div>
              <div className="font-bold tabular-nums">{fmt(result.blendUsdc)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Vault</div>
              <div className="font-bold tabular-nums">{fmt(result.vaultUsdc)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Total</div>
              <div className="font-bold tabular-nums">{fmt(result.total)}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
