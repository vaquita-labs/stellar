'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import { type Token, type TokenCreatePayload, createToken, deleteToken, updateToken, useTokens } from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Card, Checkbox, Input } from '@vaquita/ui';
import { useState } from 'react';

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

export default function Page() {
  const { data: tokens, refetch, isLoading } = useTokens();

  // null = no form open; 'new' = create; number = editing that token id.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
    };
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
          {/* Inline create/edit form */}
          {editing !== null && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-base font-semibold text-black">
                {editing === 'new' ? 'New token' : `Edit token #${editing}`}
              </h2>

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
                label="Lock periods (comma separated)"
                placeholder="e.g. 30, 60, 90"
                value={form.lockPeriods}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('lockPeriods', e.target.value)}
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onPress={closeForm} isDisabled={saving}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={submit} isDisabled={saving} isLoading={saving}>
                  {editing === 'new' ? 'Create' : 'Save'}
                </Button>
              </div>
            </Card>
          )}

          {/* Token list */}
          {(tokens?.length ?? 0) === 0 ? (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No tokens yet. Use “Add token” to create the first one.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {tokens?.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black border-b-2 bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t.symbol}</span>
                      <span className="text-sm text-default-500">{t.name}</span>
                      {t.decimals != null && <span className="text-xs text-default-400">· {t.decimals} dec</span>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.isNative && <span className="rounded bg-default-100 px-1.5 text-xs">native</span>}
                      {t.isGas && <span className="rounded bg-default-100 px-1.5 text-xs">gas</span>}
                      <span
                        className={`rounded px-1.5 text-xs ${
                          t.isSupported ? 'bg-success-100 text-success-700' : 'bg-default-100 text-default-500'
                        }`}
                      >
                        {t.isSupported ? 'supported' : 'unsupported'}
                      </span>
                    </div>
                    {t.contractAddress && (
                      <span className="break-all font-mono text-xs text-default-400">{t.contractAddress}</span>
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
