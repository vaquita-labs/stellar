'use client';

import { AppModal, addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type LockPeriodSync,
  type Token,
  type TokenCreatePayload,
  type TokenOnchainSnapshot,
  createToken,
  deleteToken,
  fetchTokenOnchain,
  updateToken,
  useTokens,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Checkbox, Input } from '@vaquita/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

type FormState = {
  name: string;
  symbol: string;
  decimals: string;
  isNative: boolean;
  isGas: boolean;
  isSupported: boolean;
  contractAddress: string;
  vaquitaContractAddress: string;
  lockPeriods: string;
  defindexVaultContractAddress: string;
  issuer: string;
  blendPoolContractAddress: string;
};

const emptyForm = (): FormState => ({
  name: '',
  symbol: '',
  decimals: '',
  isNative: false,
  isGas: false,
  isSupported: false,
  contractAddress: '',
  vaquitaContractAddress: '',
  // Edited comma/space separated; parsed back to an int[] on submit.
  lockPeriods: '',
  defindexVaultContractAddress: '',
  issuer: '',
  blendPoolContractAddress: '',
});

const formFromToken = (t: Token): FormState => ({
  name: t.name,
  symbol: t.symbol,
  decimals: t.decimals?.toString() ?? '',
  isNative: t.isNative,
  isGas: t.isGas,
  isSupported: t.isSupported,
  contractAddress: t.contractAddress ?? '',
  vaquitaContractAddress: t.vaquitaContractAddress ?? '',
  lockPeriods: (t.lockPeriods ?? []).join(', '),
  defindexVaultContractAddress: t.defindexVaultContractAddress ?? '',
  issuer: t.issuer ?? '',
  blendPoolContractAddress: t.blendPoolContractAddress ?? '',
});

// "30, 60 90" -> [30, 60, 90]; ignores blanks/non-numbers.
const parseLockPeriods = (raw: string): number[] =>
  raw
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);

// Trim; a blank field becomes null (clears the column).
const orNull = (v: string): string | null => (v.trim() ? v.trim() : null);

// 604800 -> "7d", 3600 -> "1h", 90 -> "90s".
const formatPeriod = (seconds: number): string => {
  if (seconds % 86400 === 0 && seconds > 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0 && seconds > 0) return `${seconds / 3600}h`;
  return `${seconds}s`;
};

// The `lock_periods` column is milliseconds, the unit the deposit flow divides
// down to seconds before calling the pool. Rendering it any other way would
// disagree with what the app does with the same number.
const formatLockPeriod = (ms: number): string => formatPeriod(Math.trunc(ms / 1000));

// Green when the app and the pool agree on the lock periods, red when they do
// not, neutral when the pool's storage could not be read and there is no verdict.
const lockSyncTone = (inSync: boolean | null): string =>
  inSync === null
    ? 'bg-default-100 text-default-500'
    : inSync
      ? 'bg-success-100 text-success-700'
      : 'bg-danger-100 text-danger-700';

const lockSyncLabel = (inSync: boolean | null): string =>
  inSync === null ? 'locks unknown' : inSync ? 'locks in sync' : 'locks out of sync';

const shortAddress = (address: string): string =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;

type OnchainState = { loading: boolean; data: TokenOnchainSnapshot | null; error: string | null };

export default function Page() {
  const { data: tokens, refetch, isLoading } = useTokens();

  // null = no form open; 'new' = create; number = editing that token id.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [syncingPeriods, setSyncingPeriods] = useState(false);
  // Per-token on-chain snapshot, loaded automatically for every token that has
  // a pool address. Errors render inside the panel (no toast) so a token with a
  // bad address doesn't spam the page on every load.
  const [onchain, setOnchain] = useState<Record<number, OnchainState>>({});
  const onchainRequested = useRef<Set<number>>(new Set());

  const loadOnchain = useCallback(async (t: Token) => {
    setOnchain((s) => ({ ...s, [t.id]: { loading: true, data: s[t.id]?.data ?? null, error: null } }));
    try {
      const data = await fetchTokenOnchain(t.id);
      setOnchain((s) => ({ ...s, [t.id]: { loading: false, data, error: null } }));
    } catch (err) {
      setOnchain((s) => ({
        ...s,
        [t.id]: { loading: false, data: s[t.id]?.data ?? null, error: (err as Error)?.message ?? 'Lookup failed' },
      }));
    }
  }, []);

  useEffect(() => {
    for (const t of tokens ?? []) {
      if (t.vaquitaContractAddress && !onchainRequested.current.has(t.id)) {
        onchainRequested.current.add(t.id);
        loadOnchain(t);
      }
    }
  }, [tokens, loadOnchain]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setForm(emptyForm());
    setEditing('new');
  };

  const openEdit = (t: Token) => {
    setForm(formFromToken(t));
    setEditing(t.id);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const buildPayload = (): TokenCreatePayload => {
    const decimals = form.decimals.trim();
    return {
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      decimals: decimals ? Number(decimals) : null,
      isNative: form.isNative,
      isGas: form.isGas,
      isSupported: form.isSupported,
      contractAddress: orNull(form.contractAddress),
      vaquitaContractAddress: orNull(form.vaquitaContractAddress),
      lockPeriods: parseLockPeriods(form.lockPeriods),
      defindexVaultContractAddress: orNull(form.defindexVaultContractAddress),
      issuer: orNull(form.issuer),
      blendPoolContractAddress: orNull(form.blendPoolContractAddress),
    };
  };

  // Fill the lock periods field from the pool's SupportedLockPeriod map so the
  // app can only offer periods a deposit will actually be accepted on. The field
  // stays editable: a failed read must never block saving the rest of the token.
  const syncLockPeriods = async () => {
    if (typeof editing !== 'number') return;
    setSyncingPeriods(true);
    try {
      const snapshot = await fetchTokenOnchain(editing);
      const onChain = snapshot.lockPeriods.onChainSeconds;
      if (onChain.length === 0) {
        addDangerToast(
          'Nothing to sync',
          'The pool has no lock periods registered. Register one with add_lock_period before syncing, or the app would be left with no periods to offer.',
        );
        return;
      }
      // A zero period cannot exist on-chain (the constructor rejects it), so it
      // is the app's own "no lock" entry and syncing must not drop it.
      const keepNoLock = parseLockPeriods(form.lockPeriods).includes(0) ? [0] : [];
      set('lockPeriods', [...keepNoLock, ...onChain.map((seconds) => seconds * 1000)].join(', '));
      addSuccessToast('Synced', `Filled with ${onChain.length} period(s) from the pool. Save to apply.`);
    } catch (err) {
      addDangerToast('Sync failed', (err as Error)?.message ?? 'Could not read the pool.');
    } finally {
      setSyncingPeriods(false);
    }
  };

  const submit = async () => {
    if (!form.name.trim()) {
      addDangerToast('Missing field', 'Name is required.');
      return;
    }
    if (!form.symbol.trim()) {
      addDangerToast('Missing field', 'Symbol is required.');
      return;
    }
    const decimals = form.decimals.trim();
    if (decimals && !Number.isInteger(Number(decimals))) {
      addDangerToast('Invalid field', 'Decimals must be a whole number.');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await createToken(buildPayload());
        addSuccessToast('Saved', 'Token created.');
      } else if (typeof editing === 'number') {
        await updateToken({ id: editing, ...buildPayload() });
        addSuccessToast('Saved', 'Token updated.');
      }
      await refetch();
      closeForm();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: Token) => {
    if (!window.confirm(`Delete token "${t.name}" (${t.symbol})? This can't be undone from here.`)) {
      return;
    }
    setDeletingId(t.id);
    try {
      await deleteToken(t.id);
      addSuccessToast('Deleted', `Token "${t.symbol}" removed.`);
      if (editing === t.id) closeForm();
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tokens</h1>
        <Button variant="primary" onPress={openCreate} isDisabled={editing === 'new'}>
          Add token
        </Button>
      </div>

      <p className="text-sm text-default-500">
        Tokens supported by the project (contract addresses, decimals, lock periods).
      </p>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Create/edit modal with every editable field */}
          <AppModal
            open={editing !== null}
            onOpenChange={closeForm}
            size="lg"
            title={editing === 'new' ? 'New token' : `Edit token #${editing}`}
            footer={
              <>
                <Button variant="ghost" onPress={closeForm} isDisabled={saving}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={submit} isDisabled={saving} isLoading={saving}>
                  {editing === 'new' ? 'Create' : 'Save'}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <Input
                  label="Name"
                  containerClassName="flex-1"
                  maxLength={50}
                  value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                />
                <Input
                  label="Symbol"
                  containerClassName="flex-1"
                  maxLength={20}
                  placeholder="e.g. USDC"
                  value={form.symbol}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('symbol', e.target.value)}
                />
                <Input
                  label="Decimals"
                  containerClassName="w-28"
                  inputMode="numeric"
                  placeholder="e.g. 7"
                  value={form.decimals}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('decimals', e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <Checkbox
                  label="Native"
                  checked={form.isNative}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('isNative', e.target.checked)}
                />
                <Checkbox
                  label="Gas"
                  checked={form.isGas}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('isGas', e.target.checked)}
                />
                <Checkbox
                  label="Supported"
                  checked={form.isSupported}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('isSupported', e.target.checked)}
                />
              </div>

              <Input
                label="Contract address"
                maxLength={128}
                placeholder="C..."
                value={form.contractAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('contractAddress', e.target.value)}
              />

              <Input
                label="Vaquita contract address"
                maxLength={128}
                placeholder="C..."
                value={form.vaquitaContractAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('vaquitaContractAddress', e.target.value)}
              />

              <Input
                label="DeFindex vault contract address"
                placeholder="C..."
                value={form.defindexVaultContractAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('defindexVaultContractAddress', e.target.value)}
              />

              <Input
                label="Asset issuer"
                maxLength={56}
                placeholder="G..."
                value={form.issuer}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('issuer', e.target.value)}
              />

              <Input
                label="Blend pool contract address"
                maxLength={128}
                placeholder="C..."
                value={form.blendPoolContractAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('blendPoolContractAddress', e.target.value)}
              />

              <div className="flex flex-col gap-1">
                <div className="flex items-end gap-2">
                  <div className="grow">
                    <Input
                      label="Lock periods (milliseconds, comma separated)"
                      placeholder="e.g. 604800000, 7776000000"
                      value={form.lockPeriods}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('lockPeriods', e.target.value)}
                    />
                  </div>
                  {typeof editing === 'number' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={syncLockPeriods}
                      isDisabled={syncingPeriods || saving}
                      isLoading={syncingPeriods}
                    >
                      Sync from contract
                    </Button>
                  )}
                </div>
                <span className="text-xs text-default-400">
                  {typeof editing === 'number'
                    ? 'Sync copies the periods the pool accepts. Anything else here makes deposits revert with InvalidPeriod (#4).'
                    : 'Save the token with its pool address first, then reopen it to sync these from the contract.'}
                </span>
              </div>
            </div>
          </AppModal>

          {/* Token list */}
          {(tokens?.length ?? 0) === 0 ? (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No tokens yet. Use “Add token” to create the first one.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {tokens?.map((t) => (
                <li key={t.id} className="flex flex-col gap-3 rounded-xl border border-black border-b-2 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{t.symbol}</span>
                        <span className="text-sm text-default-500">{t.name}</span>
                        {t.decimals != null && <span className="text-xs text-default-400">· {t.decimals} dec</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`rounded px-1.5 text-xs font-medium ${
                            t.readiness.usable
                              ? 'bg-success-100 text-success-700'
                              : 'bg-warning-100 text-warning-700'
                          }`}
                        >
                          {t.readiness.usable ? '✓ shown in app' : 'hidden from app'}
                        </span>
                        {t.isNative && <span className="rounded bg-default-100 px-1.5 text-xs">native</span>}
                        {t.isGas && <span className="rounded bg-default-100 px-1.5 text-xs">gas</span>}
                        <span
                          className={`rounded px-1.5 text-xs ${
                            t.isSupported ? 'bg-success-100 text-success-700' : 'bg-default-100 text-default-500'
                          }`}
                        >
                          {t.isSupported ? 'supported' : 'unsupported'}
                        </span>
                        {t.lockPeriods.length > 0 && (
                          <span className="rounded bg-default-100 px-1.5 text-xs" title={t.lockPeriods.join(', ')}>
                            locks: {t.lockPeriods.map(formatLockPeriod).join(' · ')}
                          </span>
                        )}
                      </div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                        <dt className="text-default-400">Contract</dt>
                        <dd className="break-all font-mono text-default-500">{t.contractAddress ?? '—'}</dd>
                        <dt className="text-default-400">Vaquita pool</dt>
                        <dd className="break-all font-mono text-default-500">{t.vaquitaContractAddress ?? '—'}</dd>
                        <dt className="text-default-400">DeFindex vault</dt>
                        <dd className="break-all font-mono text-default-500">{t.defindexVaultContractAddress ?? '—'}</dd>
                        <dt className="text-default-400">Issuer</dt>
                        <dd className="break-all font-mono text-default-500">{t.issuer ?? '—'}</dd>
                        <dt className="text-default-400">Blend pool</dt>
                        <dd className="break-all font-mono text-default-500">{t.blendPoolContractAddress ?? '—'}</dd>
                      </dl>
                      {!t.readiness.usable && (
                        <div className="rounded-medium bg-warning-50 p-2 text-xs text-warning-700">
                          <p className="font-medium">
                            The app does not offer this token. Fill these in to publish it:
                          </p>
                          <ul className="mt-1 flex flex-col gap-1">
                            {t.readiness.gaps.map((gap) => (
                              <li key={gap.field}>
                                <span className="font-medium">{gap.label}</span> — {gap.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onPress={() => openEdit(t)} isDisabled={saving}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onPress={() => remove(t)}
                        isDisabled={deletingId === t.id}
                        isLoading={deletingId === t.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* On-chain snapshot: pool balances + per-address positions. */}
                  {t.vaquitaContractAddress && <OnchainPanel state={onchain[t.id]} onRefresh={() => loadOnchain(t)} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only view of the pool's on-chain money: where it sits and who owns it. */
function OnchainPanel({ state, onRefresh }: { state: OnchainState | undefined; onRefresh: () => void }) {
  const snapshot = state?.data;
  const loading = state?.loading ?? true;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-default-200 bg-default-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">On-chain pool snapshot</h3>
        <Button size="sm" variant="ghost" onPress={onRefresh} isDisabled={loading} isLoading={loading}>
          Refresh
        </Button>
      </div>

      {state?.error && (
        <div className="rounded-lg bg-danger-50 p-2 text-xs text-danger-700">{state.error}</div>
      )}

      {!snapshot && loading && (
        <div className="flex justify-center p-4">
          <Spinner />
        </div>
      )}

      {snapshot && <OnchainSnapshotBody snapshot={snapshot} />}
    </div>
  );
}

/**
 * Side-by-side of the lock periods the app offers and the ones the pool accepts.
 * A period only the app knows makes every deposit on it revert with
 * InvalidPeriod, so each offending entry is called out individually.
 */
function LockPeriodSyncPanel({ sync }: { sync: LockPeriodSync }) {
  const chip = (seconds: number, mismatched: boolean) => (
    <span
      key={seconds}
      className={`rounded px-1.5 py-0.5 ${mismatched ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700'}`}
    >
      {formatPeriod(seconds)}
    </span>
  );

  const row = (label: string, seconds: number[], mismatched: number[], emptyText: string) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-16 shrink-0 text-default-400">{label}</span>
      {seconds.length === 0 ? (
        <span className="text-default-400">{emptyText}</span>
      ) : (
        seconds.map((s) => chip(s, mismatched.includes(s)))
      )}
    </div>
  );

  const borderTone =
    sync.inSync === null ? 'border-default-200' : sync.inSync ? 'border-success-200' : 'border-danger-200';

  return (
    <div className={`flex flex-col gap-2 rounded-lg border ${borderTone} p-2 text-xs`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-default-500">Lock periods</span>
        <span className={`rounded px-1.5 ${lockSyncTone(sync.inSync)}`}>{lockSyncLabel(sync.inSync)}</span>
      </div>

      {row('On chain', sync.onChainSeconds, sync.missingInDbSeconds, 'none registered')}
      {row('In DB', sync.dbSeconds, sync.missingOnChainSeconds, 'none configured')}

      {sync.inSync === false && (
        <div className="flex flex-col gap-1 text-danger-700">
          {sync.missingOnChainSeconds.length > 0 && (
            <p>
              The app offers {sync.missingOnChainSeconds.map(formatPeriod).join(', ')} but the pool does not accept it —
              those deposits revert with InvalidPeriod (#4). Register it on-chain with add_lock_period, or remove it
              from this token.
            </p>
          )}
          {sync.missingInDbSeconds.length > 0 && (
            <p>
              The pool accepts {sync.missingInDbSeconds.map(formatPeriod).join(', ')} but this token does not list it,
              so nobody can choose it.
            </p>
          )}
        </div>
      )}

      {sync.inSync === null && (
        <p className="text-default-500">
          The pool&apos;s instance storage could not be read, so these lists cannot be compared.
        </p>
      )}
    </div>
  );
}

function OnchainSnapshotBody({ snapshot }: { snapshot: TokenOnchainSnapshot }) {
  const symbol = snapshot.token.symbol;
  const stat = (label: string, value: string) => (
    <div className="flex flex-col rounded-lg bg-default-50 px-2 py-1">
      <span className="text-[10px] uppercase text-default-400">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
        <span className="rounded bg-default-100 px-1.5">{snapshot.network}</span>
        {snapshot.paused != null && (
          <span className={`rounded px-1.5 ${snapshot.paused ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700'}`}>
            {snapshot.paused ? 'paused' : 'active'}
          </span>
        )}
        <span className={`rounded px-1.5 ${lockSyncTone(snapshot.lockPeriods.inSync)}`}>
          {lockSyncLabel(snapshot.lockPeriods.inSync)}
        </span>
        <span className="break-all font-mono">{snapshot.pool}</span>
      </div>

      <LockPeriodSyncPanel sync={snapshot.lockPeriods} />

      <div className="flex flex-wrap gap-2">
        {stat('Vault value', snapshot.vault.underlyingFormatted != null ? `${snapshot.vault.underlyingFormatted} ${symbol}` : '—')}
        {stat('Vault shares', snapshot.vault.shares ?? '—')}
        {stat('Idle in pool', snapshot.idleBalanceFormatted != null ? `${snapshot.idleBalanceFormatted} ${symbol}` : '—')}
        {stat('Protocol fees', snapshot.protocolFeesFormatted != null ? `${snapshot.protocolFeesFormatted} ${symbol}` : '—')}
        {stat('Open positions', snapshot.positionCount != null ? String(snapshot.positionCount) : '—')}
      </div>

      {snapshot.periods.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-default-500">Deposits by lock period</span>
          <div className="flex flex-wrap gap-2">
            {snapshot.periods.map((p) => (
              <div key={p.periodSeconds} className="rounded-lg bg-default-50 px-2 py-1 text-sm">
                <span className="font-semibold">{formatPeriod(p.periodSeconds)}</span>{' '}
                <span>
                  {p.totalDepositsFormatted} {symbol}
                </span>
                {p.positionsCount != null && (
                  <span className="text-xs text-default-400">
                    {' '}
                    · {p.positionsCount} deposit{p.positionsCount === 1 ? '' : 's'}
                  </span>
                )}
                {p.rewardPool !== '0' && <span className="text-xs text-default-400"> · rewards {p.rewardPoolFormatted}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-default-500">
          Holders ({snapshot.coverage.livePositions} live positions from {snapshot.coverage.dbDepositIds} DB deposit ids)
        </span>
        {snapshot.holders.length === 0 ? (
          <span className="text-sm text-default-400">No live positions found.</span>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-default-400">
                <th className="py-1 font-medium">Address</th>
                <th className="py-1 font-medium">Positions</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.holders.map((h) => (
                <tr key={h.address} className="border-t border-default-100">
                  <td className="py-1 font-mono text-xs" title={h.address}>
                    {shortAddress(h.address)}
                  </td>
                  <td className="py-1">
                    {h.positions.map((p) => (
                      <span key={p.depositIdHex} className="mr-1 rounded bg-default-100 px-1 text-xs" title={p.depositIdHex}>
                        {p.amountFormatted} · {formatPeriod(p.lockPeriodSeconds)} · unlocks{' '}
                        {new Date(p.finalizationTime * 1000).toLocaleDateString()}
                      </span>
                    ))}
                  </td>
                  <td className="py-1 text-right font-semibold">
                    {h.totalAmountFormatted} {symbol}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {snapshot.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-warning-50 p-2 text-xs text-warning-700">
          {snapshot.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}
