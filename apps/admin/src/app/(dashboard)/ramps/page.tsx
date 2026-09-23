'use client';

import { addDangerToast } from '@/core-ui/components';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { SEVERITY_RANK, worstSeverity, type RampRow, type Severity } from '@/lib/rampIssues';
import type { VerifiedTransfer } from '@/app/api/admin/ramps/verify/route';
import { Modal } from '@heroui/react';
import { Button, Card, Input, Select } from '@vaquita/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

interface RampsResponse {
  days: number;
  network: 'public' | 'testnet';
  tables: { onramp: boolean; offramp: boolean };
  onramp: RampRow[];
  offramp: RampRow[];
}

type VerifyResult =
  | { hash: string; found: false }
  | {
      hash: string;
      found: true;
      successful: boolean;
      createdAt: string | null;
      ledger: number | null;
      transfers: VerifiedTransfer[];
    };

type Tab = 'issues' | 'onramp' | 'offramp';

const TABS: { key: Tab; label: string }[] = [
  { key: 'issues', label: 'Inconsistencies' },
  { key: 'onramp', label: 'On-ramp' },
  { key: 'offramp', label: 'Off-ramp' },
];

const WINDOWS = [7, 30, 90, 365];

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
  high: { label: 'High', cls: 'bg-orange-100 text-orange-700' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
  low: { label: 'Low', cls: 'bg-gray-100 text-gray-600' },
};

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700',
  paid: 'bg-blue-100 text-blue-700',
  settled: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-600',
  abandoned: 'bg-gray-100 text-gray-600',
};

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

const shortId = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-5)}` : a);
const shortTime = (iso: string) => new Date(iso).toLocaleString();

const ageOf = (iso: string): string => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
};

const isOpen = (r: RampRow) => r.status === 'pending' || r.status === 'paid';

const railOf = (r: RampRow) => (r.kind === 'offramp' && r.rail ? `${r.country} · ${r.rail}` : r.country);

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${value > 0 && tone ? tone : 'text-black'}`}>{value}</span>
    </Card>
  );
}

export default function RampsPage() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('issues');
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RampRow | null>(null);
  const [verify, setVerify] = useState<Record<string, VerifyResult | 'loading'>>({});

  const { data, isLoading, isFetching, refetch, error } = useQuery<RampsResponse>({
    queryKey: ['admin', 'ramps', days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/ramps?days=${days}`, { headers: adminHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Failed to load ramps');
      return body.data as RampsResponse;
    },
  });

  const all = useMemo(() => [...(data?.onramp ?? []), ...(data?.offramp ?? [])], [data]);

  const kpis = useMemo(() => {
    let critical = 0;
    let high = 0;
    let stale = 0;
    for (const r of all) {
      const worst = worstSeverity(r.issues);
      if (worst === 'critical') critical += 1;
      else if (worst === 'high') high += 1;
      else if (worst) stale += 1;
    }
    return {
      critical,
      high,
      stale,
      openOnramp: (data?.onramp ?? []).filter(isOpen).length,
      openOfframp: (data?.offramp ?? []).filter(isOpen).length,
    };
  }, [all, data]);

  const countries = useMemo(() => Array.from(new Set(all.map((r) => r.country))).sort(), [all]);
  const statuses = useMemo(() => Array.from(new Set(all.map((r) => r.status))).sort(), [all]);

  const rows = useMemo(() => {
    const base =
      tab === 'issues'
        ? all.filter((r) => r.issues.length > 0)
        : tab === 'onramp'
          ? (data?.onramp ?? [])
          : (data?.offramp ?? []);
    const q = search.trim().toLowerCase();
    const filtered = base.filter((r) => {
      if (country && r.country !== country) return false;
      if (status && r.status !== status) return false;
      if (!q) return true;
      return [r.walletAddress, r.nickname, r.providerTxId, r.id].some((v) => v?.toLowerCase().includes(q));
    });
    if (tab !== 'issues') return filtered;
    // Worst first, then the oldest of each severity: the longer a money problem
    // sits, the harder it is to trace with the provider.
    return [...filtered].sort((a, b) => {
      const sa = SEVERITY_RANK[worstSeverity(a.issues) ?? 'low'];
      const sb = SEVERITY_RANK[worstSeverity(b.issues) ?? 'low'];
      return sa !== sb ? sa - sb : a.createdAt.localeCompare(b.createdAt);
    });
  }, [tab, all, data, country, status, search]);

  const explorerTx = (hash: string) => `https://stellar.expert/explorer/${data?.network ?? 'testnet'}/tx/${hash}`;
  const explorerAccount = (addr: string) =>
    `https://stellar.expert/explorer/${data?.network ?? 'testnet'}/account/${addr}`;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard is permission-gated and blocked outright over plain HTTP.
      addDangerToast('Copy failed', value);
    }
  };

  const runVerify = async (hash: string) => {
    setVerify((v) => ({ ...v, [hash]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/ramps/verify?hash=${encodeURIComponent(hash)}`, { headers: adminHeaders() });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? 'Verification failed');
      setVerify((v) => ({ ...v, [hash]: body.data as VerifyResult }));
    } catch (e) {
      setVerify((v) => {
        const next = { ...v };
        delete next[hash];
        return next;
      });
      addDangerToast('Verification failed', (e as Error)?.message ?? '');
    }
  };

  const exportCsv = () => {
    const cell = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'kind',
      'id',
      'wallet',
      'user',
      'country',
      'amount',
      'currency',
      'usdc',
      'status',
      'step',
      'provider_tx_id',
      'vault_withdraw_hash',
      'payment_hash',
      'issues',
      'created_at',
      'updated_at',
    ];
    const lines = rows.map((r) => [
      r.kind,
      r.id,
      r.walletAddress,
      r.nickname,
      r.country,
      r.amountFiat,
      r.currency,
      r.kind === 'offramp' ? r.usdcAmount : '',
      r.status,
      r.kind === 'offramp' ? r.step : '',
      r.providerTxId,
      r.kind === 'offramp' ? r.vaultWithdrawHash : '',
      r.kind === 'offramp' ? r.paymentHash : '',
      r.issues.map((i) => i.code).join(' '),
      r.createdAt,
      r.updatedAt,
    ]);
    const csv = [header, ...lines].map((l) => l.map(cell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ramps-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const missingTables = data && (!data.tables.onramp || !data.tables.offramp);

  return (
    <div className="flex max-w-6xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Ramps</h1>
        <p className="text-sm text-gray-500">
          Fiat on-ramp purchases and off-ramp withdrawals, with the rows that look inconsistent. Built from what the app
          recorded and from the ledger: the provider only shows a transaction to the user who created it, so its own
          status is not available here.
        </p>
      </div>

      {missingTables && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
          Missing table in this database: {!data.tables.onramp && 'onramp_purchases '}
          {!data.tables.offramp && 'offramp_withdrawals'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Critical" value={kpis.critical} tone="text-red-600" />
        <Kpi label="High" value={kpis.high} tone="text-orange-600" />
        <Kpi label="Stale / other" value={kpis.stale} tone="text-amber-600" />
        <Kpi label="Open on-ramps" value={kpis.openOnramp} />
        <Kpi label="Open off-ramps" value={kpis.openOfframp} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full border border-black px-3 py-1 text-sm font-semibold transition ${
              tab === t.key ? 'bg-black text-white' : 'bg-white text-black hover:bg-primary/5'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="ghost" onPress={() => void refetch()} isDisabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button variant="ghost" onPress={exportCsv} isDisabled={rows.length === 0}>
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Wallet, user, provider tx id or row id"
          containerClassName="min-w-64 flex-1"
        />
        <Select aria-label="Country" className="w-36" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Any country</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select aria-label="Status" className="w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          aria-label="History window"
          className="w-40"
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {WINDOWS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </Select>
      </div>
      {/* Without this, a clean Inconsistencies tab would read as "nothing old is
          wrong" when the window simply hid it. */}
      <p className="-mt-2 text-xs text-gray-500">
        The window limits history only. Open rows and off-ramps that moved USDC without settling are always listed.
      </p>

      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left text-xs text-gray-500">
            <tr>
              {tab === 'issues' && <th className="px-3 py-2 font-medium">Severity</th>}
              {tab === 'issues' && <th className="px-3 py-2 font-medium">Issue</th>}
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">Country</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                  {tab === 'issues' ? 'No inconsistencies found.' : 'No rows match the filters.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const worst = worstSeverity(r.issues);
                return (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer border-t border-black/[0.06] hover:bg-primary/5"
                  >
                    {tab === 'issues' && (
                      <td className="px-3 py-2">
                        {worst && <Chip cls={SEVERITY[worst].cls}>{SEVERITY[worst].label}</Chip>}
                      </td>
                    )}
                    {tab === 'issues' && (
                      <td className="px-3 py-2">
                        {r.issues[0]?.title}
                        {r.issues.length > 1 && <span className="text-gray-400"> +{r.issues.length - 1}</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs text-gray-500">{r.kind === 'onramp' ? 'On' : 'Off'}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono" title={r.walletAddress}>
                        {shortId(r.walletAddress)}
                      </span>
                      {r.nickname && <span className="ml-2 text-xs text-gray-500">{r.nickname}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{railOf(r)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {r.amountFiat} {r.currency}
                      {r.kind === 'offramp' && r.usdcAmount && (
                        <div className="text-xs text-gray-500">{r.usdcAmount} USDC</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Chip cls={STATUS_CLS[r.status] ?? 'bg-gray-100 text-gray-600'}>{r.status}</Chip>
                      {r.kind === 'offramp' && isOpen(r) && (
                        <span className="ml-1 text-xs text-gray-500">{r.step}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500" title={shortTime(r.createdAt)}>
                      {ageOf(r.createdAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      <Modal.Backdrop isOpen={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <Modal.Container scroll="inside" size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{selected?.kind === 'onramp' ? 'On-ramp purchase' : 'Off-ramp withdrawal'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {selected && (
                <div className="flex flex-col gap-4 text-sm">
                  {selected.issues.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {selected.issues.map((i) => (
                        <li key={i.code} className="rounded-md border border-black/10 p-3">
                          <div className="mb-1 flex items-center gap-2">
                            <Chip cls={SEVERITY[i.severity].cls}>{SEVERITY[i.severity].label}</Chip>
                            <span className="font-semibold">{i.title}</span>
                          </div>
                          <p className="text-gray-600">{i.detail}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                    <Field label="Row id" value={selected.id} onCopy={copy} mono />
                    <Field
                      label="Wallet"
                      value={selected.walletAddress}
                      href={explorerAccount(selected.walletAddress)}
                      onCopy={copy}
                      mono
                    />
                    <Field label="User" value={selected.nickname} />
                    <Field label="Provider" value={selected.provider} />
                    <Field label="Provider tx id" value={selected.providerTxId} onCopy={copy} mono />
                    <Field label="Country" value={railOf(selected)} />
                    <Field label="Amount" value={`${selected.amountFiat} ${selected.currency}`} />
                    {selected.kind === 'offramp' && <Field label="USDC" value={selected.usdcAmount} />}
                    <Field label="Status" value={selected.status} />
                    {selected.kind === 'offramp' && <Field label="Step" value={selected.step} />}
                    <Field label="Error" value={selected.errorReason} />
                    {selected.kind === 'onramp' && (
                      <Field label="Expires" value={selected.expiresAt && shortTime(selected.expiresAt)} />
                    )}
                    <Field label="Created" value={shortTime(selected.createdAt)} />
                    <Field label="Updated" value={shortTime(selected.updatedAt)} />
                  </dl>

                  {selected.kind === 'offramp' && (
                    <div className="flex flex-col gap-3">
                      {(
                        [
                          ['Vault withdrawal', selected.vaultWithdrawHash],
                          ['Payment to provider', selected.paymentHash],
                        ] as const
                      ).map(([label, hash]) => (
                        <HashCheck
                          key={label}
                          label={label}
                          hash={hash}
                          expectedUsdc={label === 'Payment to provider' ? selected.usdcAmount : null}
                          result={hash ? verify[hash] : undefined}
                          href={hash ? explorerTx(hash) : undefined}
                          onVerify={runVerify}
                        />
                      ))}
                    </div>
                  )}

                  {selected.kind === 'onramp' && (
                    <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-500">
                      The credited USDC hash is not stored for purchases, so a purchase cannot be checked on-chain from
                      here. Look the provider tx id up with the provider.
                    </p>
                  )}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setSelected(null)}>Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

function Field({
  label,
  value,
  href,
  onCopy,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  onCopy?: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className={`break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value ? (
          <>
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="underline">
                {value}
              </a>
            ) : (
              value
            )}
            {onCopy && (
              <button
                type="button"
                onClick={() => onCopy(value)}
                aria-label={`Copy ${label}`}
                className="ml-1 text-gray-300 hover:text-black"
              >
                ⧉
              </button>
            )}
          </>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </dd>
    </>
  );
}

function HashCheck({
  label,
  hash,
  expectedUsdc,
  result,
  href,
  onVerify,
}: {
  label: string;
  hash: string | null;
  expectedUsdc: string | null;
  result: VerifyResult | 'loading' | undefined;
  href?: string;
  onVerify: (hash: string) => void;
}) {
  const usdcMoved =
    result && result !== 'loading' && result.found
      ? result.transfers.filter((t) => t.asset === 'USDC').map((t) => Number(t.amount))
      : [];
  const amountMatches =
    expectedUsdc != null && usdcMoved.length > 0
      ? usdcMoved.some((a) => Math.abs(a - Number(expectedUsdc)) < 1e-7)
      : null;

  return (
    <div className="rounded-md border border-black/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {hash && (
          <Button variant="ghost" onPress={() => onVerify(hash)} isDisabled={result === 'loading'}>
            {result === 'loading' ? 'Checking…' : 'Verify on ledger'}
          </Button>
        )}
      </div>
      {hash ? (
        <a href={href} target="_blank" rel="noreferrer" className="break-all font-mono text-xs underline">
          {hash}
        </a>
      ) : (
        <p className="text-xs text-gray-400">Not recorded.</p>
      )}
      {result && result !== 'loading' && (
        <div className="mt-2 text-xs">
          {!result.found ? (
            <p className="font-semibold text-red-600">Not found on the ledger: this transaction never landed.</p>
          ) : !result.successful ? (
            <p className="font-semibold text-red-600">Included but failed: it moved nothing.</p>
          ) : (
            <>
              <p className="text-green-700">
                Confirmed{result.createdAt ? ` · ${shortTime(result.createdAt)}` : ''}
                {result.ledger ? ` · ledger ${result.ledger}` : ''}
              </p>
              {amountMatches === false && (
                <p className="font-semibold text-red-600">USDC moved differs from the row ({expectedUsdc}).</p>
              )}
              <ul className="mt-1 flex flex-col gap-0.5 text-gray-600">
                {result.transfers.map((t, i) => (
                  <li key={i} className="font-mono">
                    {t.amount} {t.asset} · {t.from ? shortId(t.from) : '?'} → {t.to ? shortId(t.to) : '?'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
