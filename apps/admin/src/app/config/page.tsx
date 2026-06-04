'use client';

import { BackToAdmin } from '@/components';
import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type ProjectConfig,
  type ProjectConfigPayload,
  updateProjectConfig,
  useProjectConfig,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Input, Textarea } from '@vaquita/ui';
import { useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

// Currencies and languages share the same `{ id, label, hint? }` shape and the
// same add/edit/delete editor, so they're modeled with one local type.
type Option = { id: string; label: string; hint?: string };

// The two option lists live on the form under these keys; helpers are generic
// over the key so currencies and languages reuse the same handlers.
type OptionKey = 'currencies' | 'languages';

type FormState = {
  networkName: string;
  origins: string;
  networkPassphrase: string;
  badgesContractAddress: string;
  // Held as a string while editing; parsed to number|null on submit.
  cycleDurationMs: string;
  // Edited inline as a list of rows; each blank-hint row stores hint: ''.
  currencies: Option[];
  languages: Option[];
};

const emptyForm = (): FormState => ({
  networkName: '',
  origins: '',
  networkPassphrase: '',
  badgesContractAddress: '',
  cycleDurationMs: '',
  currencies: [],
  languages: [],
});

const toRows = (list: Option[] | undefined): Option[] =>
  (list ?? []).map((o) => ({ id: o.id ?? '', label: o.label ?? '', hint: o.hint ?? '' }));

const formFromConfig = (c: ProjectConfig): FormState => ({
  networkName: c.networkName ?? '',
  // Edited one-per-line; joined back to a string[] on submit.
  origins: (c.origins ?? []).join('\n'),
  networkPassphrase: c.networkPassphrase ?? '',
  badgesContractAddress: c.badgesContractAddress ?? '',
  cycleDurationMs: c.cycleDurationMs != null ? String(c.cycleDurationMs) : '',
  currencies: toRows(c.currencies),
  languages: toRows(c.languages),
});

// Trim every field and drop the optional hint when blank, so the persisted
// shape matches `{ id, label, hint? }` exactly.
const buildOptions = (list: Option[]): Option[] =>
  list.map((o) => {
    const hint = o.hint?.trim();
    return { id: o.id.trim(), label: o.label.trim(), ...(hint ? { hint } : {}) };
  });

/** Add/edit/delete editor for one `{ id, label, hint? }` option list. */
function OptionListEditor({
  title,
  description,
  addLabel,
  emptyText,
  placeholders,
  items,
  saving,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  description: React.ReactNode;
  addLabel: string;
  emptyText: string;
  placeholders: { id: string; label: string; hint: string };
  items: Option[];
  saving: boolean;
  onAdd: () => void;
  onChange: (index: number, field: keyof Option, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm">{title}</span>
        <Button size="sm" variant="ghost" onPress={onAdd} isDisabled={saving}>
          <span className="flex items-center gap-1">
            <FiPlus /> {addLabel}
          </span>
        </Button>
      </div>
      <p className="text-xs text-default-500">{description}</p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/30 bg-white p-4 text-center text-sm text-default-400">
          {emptyText}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-end gap-2">
              <Input
                label={<span className="text-xs text-default-500">id</span>}
                containerClassName="w-24 shrink-0"
                maxLength={20}
                placeholder={placeholders.id}
                value={item.id}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(i, 'id', e.target.value)}
              />
              <Input
                label={<span className="text-xs text-default-500">label</span>}
                containerClassName="w-28 shrink-0"
                maxLength={50}
                placeholder={placeholders.label}
                value={item.label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(i, 'label', e.target.value)}
              />
              <Input
                label={<span className="text-xs text-default-500">hint (optional)</span>}
                containerClassName="flex-1"
                maxLength={100}
                placeholder={placeholders.hint}
                value={item.hint ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(i, 'hint', e.target.value)}
              />
              <Button
                variant="ghost"
                className="mb-[1px] px-3 text-danger"
                aria-label={`Remove ${title.toLowerCase()} row`}
                onPress={() => onRemove(i)}
                isDisabled={saving}
              >
                <FiTrash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

  // Generic add/edit/delete handlers shared by the currencies and languages lists.
  const addOption = (key: OptionKey) => () =>
    setForm((f) => ({ ...f, [key]: [...f[key], { id: '', label: '', hint: '' }] }));

  const updateOption = (key: OptionKey) => (index: number, field: keyof Option, value: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].map((o, i) => (i === index ? { ...o, [field]: value } : o)),
    }));

  const removeOption = (key: OptionKey) => (index: number) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== index) }));

  const buildPayload = (): ProjectConfigPayload => ({
    networkName: form.networkName.trim(),
    origins: form.origins
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean),
    networkPassphrase: orNull(form.networkPassphrase),
    badgesContractAddress: orNull(form.badgesContractAddress),
    cycleDurationMs: form.cycleDurationMs.trim() ? Number(form.cycleDurationMs.trim()) : null,
    currencies: buildOptions(form.currencies),
    languages: buildOptions(form.languages),
  });

  // Returns an error message for an option list, or null when it's valid.
  const validateOptions = (list: Option[], noun: string): string | null => {
    const built = buildOptions(list);
    if (built.some((o) => !o.id || !o.label)) return `Every ${noun} needs both an id and a label.`;
    const ids = built.map((o) => o.id.toLowerCase());
    if (new Set(ids).size !== ids.length) return `${noun[0].toUpperCase()}${noun.slice(1)} ids must be unique.`;
    return null;
  };

  const submit = async () => {
    if (!form.networkName.trim()) {
      addDangerToast('Missing field', 'Network name is required.');
      return;
    }
    if (form.networkName.trim().length > 50) {
      addDangerToast('Invalid network name', 'Network name must be 50 characters or fewer.');
      return;
    }
    if (form.cycleDurationMs.trim()) {
      const ms = Number(form.cycleDurationMs.trim());
      if (!Number.isInteger(ms) || ms <= 0) {
        addDangerToast('Invalid cycle duration', 'Cycle duration must be a positive whole number of milliseconds, or empty.');
        return;
      }
    }
    const currencyError = validateOptions(form.currencies, 'currency');
    if (currencyError) {
      addDangerToast('Invalid currency', currencyError);
      return;
    }
    const languageError = validateOptions(form.languages, 'language');
    if (languageError) {
      addDangerToast('Invalid language', languageError);
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
        Singleton settings for the project (network name, passphrase, badges contract, allowed origins, display
        currencies and languages).
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

          <Input
            label="Network name"
            maxLength={50}
            value={form.networkName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('networkName', e.target.value)}
          />

          <Input
            label="Network passphrase"
            placeholder="e.g. Public Global Stellar Network ; September 2015"
            value={form.networkPassphrase}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('networkPassphrase', e.target.value)}
          />

          <Input
            label="Badges contract address"
            placeholder="C..."
            value={form.badgesContractAddress}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('badgesContractAddress', e.target.value)}
          />

          <Input
            label="Cycle duration (ms)"
            type="number"
            placeholder="Leave empty for monthly cycles (production). e.g. 900000 = 15 min"
            value={form.cycleDurationMs}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('cycleDurationMs', e.target.value)}
          />

          <Textarea
            label="Allowed origins (one per line)"
            className="min-h-[120px] font-mono"
            placeholder={'https://app.example.com\nhttps://admin.example.com'}
            value={form.origins}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('origins', e.target.value)}
          />

          <OptionListEditor
            title="Currencies"
            description={
              <>
                Fiat display options shown on the app&apos;s Preferences page. <code>id</code> is the stored value (e.g.{' '}
                <code>usd</code>), <code>label</code> is shown in the dropdown (<code>USD</code>), <code>hint</code> is
                the optional sub-label (<code>US Dollar</code>).
              </>
            }
            addLabel="Add currency"
            emptyText="No currencies yet. Add one to offer it in the app."
            placeholders={{ id: 'usd', label: 'USD', hint: 'US Dollar' }}
            items={form.currencies}
            saving={saving}
            onAdd={addOption('currencies')}
            onChange={updateOption('currencies')}
            onRemove={removeOption('currencies')}
          />

          <OptionListEditor
            title="Languages"
            description={
              <>
                Language options shown on the app&apos;s Preferences page. <code>id</code> is the stored value (e.g.{' '}
                <code>en</code>), <code>label</code> is shown in the dropdown (<code>English</code>), <code>hint</code> is
                the optional sub-label (<code>United States</code>).
              </>
            }
            addLabel="Add language"
            emptyText="No languages yet. Add one to offer it in the app."
            placeholders={{ id: 'en', label: 'English', hint: 'United States' }}
            items={form.languages}
            saving={saving}
            onAdd={addOption('languages')}
            onChange={updateOption('languages')}
            onRemove={removeOption('languages')}
          />

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onPress={() => setForm(data ? formFromConfig(data) : emptyForm())}
              isDisabled={saving}
            >
              Reset
            </Button>
            <Button variant="primary" onPress={submit} isDisabled={saving} isLoading={saving}>
              {exists ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
