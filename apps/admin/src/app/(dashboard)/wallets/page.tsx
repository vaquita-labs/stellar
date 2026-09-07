'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { Button, Card, Checkbox, Input } from '@vaquita/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

interface WalletRow {
  wallet: string;
  tokenId: number;
  nickname: string | null;
  email: string | null;
  blendUsdc: number;
  vaultUsdc: number;
  locked: number;
  total: number;
  lastError: string | null;
  scrapedAt: string;
}

type SortKey = 'blendUsdc' | 'vaultUsdc' | 'locked' | 'total';
type Status = 'migrated' | 'not-migrated' | 'partial' | 'empty';

const BATCH = 10;

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 7 });
const shortWallet = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a);
const shortTime = (iso: string) => new Date(iso).toLocaleString();

// Same wording as the metrics dashboard's `sampleAge`, so "as of" reads the
// same in both places.
const sampleAge = (iso: string): string => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

// Migration status from the passive numbers only (Locked doesn't affect it).
const statusOf = (r: WalletRow): Status => {
  const hasBlend = r.blendUsdc > 0;
  const hasVault = r.vaultUsdc > 0;
  if (hasBlend && hasVault) return 'partial';
  if (hasVault) return 'migrated';
  if (hasBlend) return 'not-migrated';
  return 'empty';
};
const STATUS: Record<Status, { label: string; cls: string }> = {
  migrated: { label: 'Migrated', cls: 'bg-green-100 text-green-700' },
  'not-migrated': { label: 'Not migrated', cls: 'bg-amber-100 text-amber-700' },
  partial: { label: 'Partial', cls: 'bg-blue-100 text-blue-700' },
  empty: { label: 'Empty', cls: 'bg-gray-100 text-gray-500' },
};

export default function WalletsPage() {
  const queryClient = useQueryClient();
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scraping, setScraping] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [allDone, setAllDone] = useState(false);

  // Vault desc IS the "top passive-yield depositors" ranking this page exists
  // to answer; Total mixed in locked-pool principal and buried them.
  const [sortKey, setSortKey] = useState<SortKey>('vaultUsdc');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [nonZeroOnly, setNonZeroOnly] = useState(false);
  const [notMigratedOnly, setNotMigratedOnly] = useState(false);
  const [tokenFilter, setTokenFilter] = useState<number | 'all'>('all');

  const { data: rows = [], isLoading: listLoading } = useQuery<WalletRow[]>({
    queryKey: ['admin', 'wallets'],
    queryFn: async () => {
      const res = await fetch('/api/admin/wallets', { headers: adminHeaders() });
      const data = await res.json();
      return (data?.data?.rows ?? []) as WalletRow[];
    },
  });

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [rows, sortKey, sortDir]);

  // Derived from the rows already on the page — the table is loaded whole, so
  // asking the server for a MAX() it just sent us would be a wasted round trip.
  const freshness = useMemo(() => {
    let scrapedAt: string | null = null;
    let errored = 0;
    for (const r of rows) {
      if (r.lastError) errored += 1;
      if (scrapedAt === null || r.scrapedAt > scrapedAt) scrapedAt = r.scrapedAt;
    }
    return { scrapedAt, rows: rows.length, errored };
  }, [rows]);

  const tokenIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.tokenId))).sort((a, b) => a - b),
    [rows],
  );

  const filtered = useMemo(
    () =>
      sorted.filter((r) => {
        if (tokenFilter !== 'all' && r.tokenId !== tokenFilter) return false;
        if (nonZeroOnly && r.blendUsdc === 0 && r.vaultUsdc === 0 && r.locked === 0) return false;
        if (notMigratedOnly && !(r.blendUsdc > 0 && r.vaultUsdc === 0)) return false;
        return true;
      }),
    [sorted, tokenFilter, nonZeroOnly, notMigratedOnly],
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          blend: acc.blend + r.blendUsdc,
          vault: acc.vault + r.vaultUsdc,
          locked: acc.locked + r.locked,
          total: acc.total + r.total,
        }),
        { blend: 0, vault: 0, locked: 0, total: 0 },
      ),
    [filtered],
  );

  const csvCell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const exportCsv = () => {
    const header = ['wallet', 'token_id', 'user', 'blend', 'vault', 'locked', 'total', 'status', 'last_read'];
    const lines = filtered.map((r) => [
      r.wallet,
      r.tokenId,
      r.nickname ?? r.email ?? '',
      r.blendUsdc,
      r.vaultUsdc,
      r.locked,
      r.total,
      statusOf(r),
      r.lastError ? `error: ${r.lastError}` : r.scrapedAt,
    ]);
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const failedWallets = rows.filter((r) => r.lastError).map((r) => r.wallet);
  const scrapedSoFar = total != null ? Math.min(cursor, total) : cursor;

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(k);
      setSortDir('desc');
    }
  };
  const sortArrow = (k: SortKey) => (sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '');

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

  const numTh = (label: string, k: SortKey) => (
    <th
      className="px-3 py-2 font-medium text-right cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      {label}
      {sortArrow(k)}
    </th>
  );

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Wallets</h1>
      <p className="text-sm text-gray-500 mb-2">
        Per-user balances: Blend + Vault read on-chain, Locked from the pool deposits. Scrape reads users in throttled
        batches; search reads any wallet on demand.
      </p>

      {/* These numbers are a snapshot, not a live read — without a refresh time
          a stale table is indistinguishable from an accurate one. */}
      <p className="text-sm text-gray-500 mb-4">
        {freshness.scrapedAt ? (
          <>
            Snapshot as of <span className="font-medium text-gray-700">{sampleAge(freshness.scrapedAt)}</span> (
            {shortTime(freshness.scrapedAt)}) · {freshness.rows} rows
            {freshness.errored > 0 ? (
              <span className="text-red-600"> · {freshness.errored} with read errors</span>
            ) : null}
          </>
        ) : (
          'Never scraped.'
        )}
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

      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm text-black">
          Token
          <select
            className="rounded-md border border-black/20 bg-white px-2 py-1 text-sm"
            value={tokenFilter}
            onChange={(e) => setTokenFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All</option>
            {tokenIds.map((id) => (
              <option key={id} value={id}>
                #{id}
              </option>
            ))}
          </select>
        </label>
        <Checkbox
          checked={nonZeroOnly}
          onChange={(e) => setNonZeroOnly(e.target.checked)}
          label="Non-zero only"
        />
        <Checkbox
          checked={notMigratedOnly}
          onChange={(e) => setNotMigratedOnly(e.target.checked)}
          label="Not migrated only"
        />
        <div className="flex-1" />
        <Button variant="ghost" onPress={exportCsv} isDisabled={filtered.length === 0}>
          Export CSV
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">Token</th>
              <th className="px-3 py-2 font-medium">User</th>
              {numTh('Blend', 'blendUsdc')}
              {numTh('Vault', 'vaultUsdc')}
              {numTh('Locked', 'locked')}
              {numTh('Total', 'total')}
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Last read</th>
            </tr>
          </thead>
          <tbody>
            {listLoading ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                  {rows.length === 0 ? 'No data yet — scrape a batch or search a wallet to start.' : 'No wallets match the filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const st = STATUS[statusOf(r)];
                return (
                  <tr key={`${r.wallet}-${r.tokenId}`} className="border-t border-black/[0.06]">
                    <td className="px-3 py-2 font-mono" title={r.wallet}>
                      {shortWallet(r.wallet)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">#{r.tokenId}</td>
                    <td className="px-3 py-2">{r.nickname ?? r.email ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.blendUsdc)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.vaultUsdc)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.locked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </td>
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
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-black/10 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={3}>
                  Totals ({filtered.length})
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.blend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.vault)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.locked)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.total)}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
