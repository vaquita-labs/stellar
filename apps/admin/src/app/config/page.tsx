'use client';

import { BackToAdmin } from '@/components';
import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type Currency,
  type ProjectConfig,
  type ProjectConfigPayload,
  updateProjectConfig,
  useProjectConfig,
} from '@/core-ui/hooks';
import { Button, Spinner } from '@heroui/react';
import { useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

type FormState = {
  networkName: string;
  origins: string;
  networkPassphrase: string;
  badgesContractAddress: string;
  // Edited inline as a list of rows; each blank-hint row stores hint: ''.
  currencies: Currency[];
};

const emptyForm = (): FormState => ({
  networkName: '',
  origins: '',
  networkPassphrase: '',
  badgesContractAddress: '',
  currencies: [],
});

const formFromConfig = (c: ProjectConfig): FormState => ({
  networkName: c.networkName ?? '',
  // Edited one-per-line; joined back to a string[] on submit.
  origins: (c.origins ?? []).join('\n'),
  networkPassphrase: c.networkPassphrase ?? '',
  badgesContractAddress: c.badgesContractAddress ?? '',
  currencies: (c.currencies ?? []).map((cur) => ({
    id: cur.id ?? '',
    label: cur.label ?? '',
    hint: cur.hint ?? '',
  })),
});

const inputLabel = 'flex flex-col gap-1 text-sm';
const inputClass =
  'w-full rounded-medium border-2 border-default-200 bg-default-100 px-3 py-2 text-sm outline-none focus:border-default-400';

export default function Page() {
  const { data, refetch, isLoading } = useProjectConfig();

  // The API always returns a config object; `id` is null until the row exists.
  const exists = data?.id != null;

  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  // Seed the form once: from the row if it exists, otherwise the empty form so
  // the (currently empty) singleton can be created from here. Re-seeds when the
  // underlying row id changes after a save.
  const [seededFor, setSeededFor] = useState<number | 'empty' | null>(null);
  if (!isLoading) {
    const target = data?.id ?? 'empty';
    if (seededFor !== target) {
      setForm(data ? formFromConfig(data) : emptyForm());
      setSeededFor(target);
    }
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Trim; a blank field becomes null (clears the column).
  const orNull = (v: string): string | null => (v.trim() ? v.trim() : null);

  const addCurrency = () =>
    setForm((f) => ({ ...f, currencies: [...f.currencies, { id: '', label: '', hint: '' }] }));

  const updateCurrency = (index: number, field: keyof Currency, value: string) =>
    setForm((f) => ({
      ...f,
      currencies: f.currencies.map((cur, i) => (i === index ? { ...cur, [field]: value } : cur)),
    }));

  const removeCurrency = (index: number) =>
    setForm((f) => ({ ...f, currencies: f.currencies.filter((_, i) => i !== index) }));

  // Trim every field and drop the optional hint when blank, so the persisted
  // shape matches `{ id, label, hint? }` exactly.
  const buildCurrencies = (): Currency[] =>
    form.currencies.map((cur) => {
      const hint = cur.hint?.trim();
      return { id: cur.id.trim(), label: cur.label.trim(), ...(hint ? { hint } : {}) };
    });

  const buildPayload = (): ProjectConfigPayload => ({
    networkName: form.networkName.trim(),
    origins: form.origins
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean),
    networkPassphrase: orNull(form.networkPassphrase),
    badgesContractAddress: orNull(form.badgesContractAddress),
    currencies: buildCurrencies(),
  });

  const submit = async () => {
    if (!form.networkName.trim()) {
      addDangerToast('Missing field', 'Network name is required.');
      return;
    }
    if (form.networkName.trim().length > 50) {
      addDangerToast('Invalid network name', 'Network name must be 50 characters or fewer.');
      return;
    }
    const currencies = buildCurrencies();
    if (currencies.some((c) => !c.id || !c.label)) {
      addDangerToast('Invalid currency', 'Every currency needs both an id and a label.');
      return;
    }
    const ids = currencies.map((c) => c.id.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      addDangerToast('Duplicate currency', 'Currency ids must be unique.');
      return;
    }
    setSaving(true);
    try {
      await updateProjectConfig(buildPayload());
      addSuccessToast('Saved', exists ? 'Project configuration updated.' : 'Project configuration created.');
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <BackToAdmin />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Project configuration</h1>
        {exists && data?.updatedAt && (
          <span className="text-xs text-default-500">Updated {new Date(data.updatedAt).toLocaleString()}</span>
        )}
      </div>

      <p className="text-sm text-default-500">
        Singleton settings for the project (network name, passphrase, badges contract, allowed origins).
      </p>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!exists && (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No configuration exists yet. Saving will create the first <code>config</code> row.
            </div>
          )}

          <label className={inputLabel}>
            Network name
            <input
              className={inputClass}
              maxLength={50}
              value={form.networkName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('networkName', e.target.value)}
            />
          </label>

          <label className={inputLabel}>
            Network passphrase
            <input
              className={inputClass}
              placeholder="e.g. Public Global Stellar Network ; September 2015"
              value={form.networkPassphrase}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('networkPassphrase', e.target.value)}
            />
          </label>

          <label className={inputLabel}>
            Badges contract address
            <input
              className={inputClass}
              placeholder="C..."
              value={form.badgesContractAddress}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('badgesContractAddress', e.target.value)}
            />
          </label>

          <label className={inputLabel}>
            Allowed origins (one per line)
            <textarea
              className={`${inputClass} min-h-[120px] font-mono`}
              placeholder={'https://app.example.com\nhttps://admin.example.com'}
              value={form.origins}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('origins', e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Currencies</span>
              <Button size="sm" variant="ghost" onPress={addCurrency} isDisabled={saving}>
                <span className="flex items-center gap-1">
                  <FiPlus /> Add currency
                </span>
              </Button>
            </div>
            <p className="text-xs text-default-500">
              Fiat display options shown on the app&apos;s Preferences page. <code>id</code> is the stored value (e.g.{' '}
              <code>usd</code>), <code>label</code> is shown in the dropdown (<code>USD</code>), <code>hint</code> is the
              optional sub-label (<code>US Dollar</code>).
            </p>

            {form.currencies.length === 0 ? (
              <div className="rounded-medium border-2 border-dashed border-default-200 p-4 text-center text-sm text-default-400">
                No currencies yet. Add one to offer it in the app.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {form.currencies.map((cur, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <label className={`${inputLabel} w-24 shrink-0`}>
                      <span className="text-xs text-default-500">id</span>
                      <input
                        className={inputClass}
                        maxLength={20}
                        placeholder="usd"
                        value={cur.id}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCurrency(i, 'id', e.target.value)}
                      />
                    </label>
                    <label className={`${inputLabel} w-28 shrink-0`}>
                      <span className="text-xs text-default-500">label</span>
                      <input
                        className={inputClass}
                        maxLength={50}
                        placeholder="USD"
                        value={cur.label}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCurrency(i, 'label', e.target.value)}
                      />
                    </label>
                    <label className={`${inputLabel} flex-1`}>
                      <span className="text-xs text-default-500">hint (optional)</span>
                      <input
                        className={inputClass}
                        maxLength={100}
                        placeholder="US Dollar"
                        value={cur.hint ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCurrency(i, 'hint', e.target.value)}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      className="mb-[1px] px-3 text-danger"
                      aria-label="Remove currency"
                      onPress={() => removeCurrency(i)}
                      isDisabled={saving}
                    >
                      <FiTrash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onPress={() => setForm(data ? formFromConfig(data) : emptyForm())}
              isDisabled={saving}
            >
              Reset
            </Button>
            <Button variant="primary" onPress={submit} isDisabled={saving}>
              {saving ? <Spinner size="sm" color="current" /> : exists ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
