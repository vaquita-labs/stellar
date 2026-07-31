'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { Button, Card, Input } from '@vaquita/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface WalletRow {
  wallet: string;
  nickname: string | null;
  email: string | null;
  blendUsdc: number;
  vaultUsdc: number;
  total: number;
  lastError: string | null;
  scrapedAt: string;
}

const BATCH = 10;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 7 });
const shortWallet = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a);
const shortTime = (iso: string) => new Date(iso).toLocaleString();

export default function WalletsPage() {
  const queryClient = useQueryClient();
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch scrape cursor: how many profiles have been scraped so far.
  const [scraping, setScraping] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [allDone, setAllDone] = useState(false);

  const { data: rows = [], isLoading: listLoading } = useQuery<WalletRow[]>({
    queryKey: ['admin', 'wallets'],
    queryFn: async () => {
      const res = await fetch('/api/admin/wallets', { headers: adminHeaders() });
      const data = await res.json();
      return (data?.data?.rows ?? []) as WalletRow[];
    },
  });

  const failedWallets = rows.filter((r) => r.lastError).map((r) => r.wallet);

  const search = async () => {
    const addr = wallet.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/wallets/onchain?wallet=${encodeURIComponent(addr)}`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Lookup failed');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      setWallet('');
    } catch (e) {
      setError((e as Error)?.message ?? 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const runScrape = async (payload: { offset?: number; limit?: number; wallets?: string[] }) => {
    setScraping(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/wallets/onchain/scrape', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? 'Scrape failed');
      const { total: t, nextOffset } = data.data as { total: number; nextOffset: number | null };
      setTotal(t);
      if (payload.wallets == null) {
        if (nextOffset == null) {
          setAllDone(true);
          setCursor(t);
        } else {
          setCursor(nextOffset);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
    } catch (e) {
      setError((e as Error)?.message ?? 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  const scrapedSoFar = total != null ? Math.min(cursor, total) : cursor;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Wallets</h1>
      <p className="text-sm text-gray-500 mb-4">
        On-chain Blend and DeFindex vault USDC per user. Scrape reads users in throttled batches; search reads any
        wallet on demand.
      </p>

      <div className="flex items-start gap-2 mb-4">
        <Input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
          placeholder="Wallet address (G… or C…)"
          containerClassName="flex-1"
        />
        <Button onPress={() => void search()} isDisabled={loading || scraping || !wallet.trim()} isLoading={loading}>
          Search
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Button
          onPress={() => void runScrape({ offset: cursor, limit: BATCH })}
          isDisabled={scraping || allDone}
          isLoading={scraping}
        >
          {allDone ? 'All scraped' : `Scrape next ${BATCH}`}
        </Button>
        {total != null && (
          <span className="text-sm text-gray-500 tabular-nums">
            scraped {scrapedSoFar} / {total}
          </span>
        )}
        {failedWallets.length > 0 && (
          <Button variant="secondary" onPress={() => void runScrape({ wallets: failedWallets })} isDisabled={scraping}>
            Retry failed ({failedWallets.length})
          </Button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium text-right">Blend</th>
              <th className="px-3 py-2 font-medium text-right">Vault</th>
              <th className="px-3 py-2 font-medium text-right">Last read</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  No data yet — scrape a batch or search a wallet to start.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.wallet} className="border-t border-black/[0.06]">
                  <td className="px-3 py-2 font-mono" title={r.wallet}>
                    {shortWallet(r.wallet)}
                  </td>
                  <td className="px-3 py-2">{r.nickname ?? r.email ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.blendUsdc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.vaultUsdc)}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">
                    {r.lastError ? (
                      <span className="text-red-600" title={r.lastError}>
                        ⚠ error
                      </span>
                    ) : (
                      shortTime(r.scrapedAt)
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
