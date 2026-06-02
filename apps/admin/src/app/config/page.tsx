'use client';

import { BackToAdmin } from '@/components';
import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import { type ProjectConfig, type ProjectConfigPayload, updateProjectConfig, useProjectConfig } from '@/core-ui/hooks';
import { Button, Spinner } from '@heroui/react';
import { useState } from 'react';

type FormState = {
  networkName: string;
  origins: string;
  networkPassphrase: string;
  badgesContractAddress: string;
};

const emptyForm = (): FormState => ({
  networkName: '',
  origins: '',
  networkPassphrase: '',
  badgesContractAddress: '',
});

const formFromConfig = (c: ProjectConfig): FormState => ({
  networkName: c.networkName ?? '',
  // Edited one-per-line; joined back to a string[] on submit.
  origins: (c.origins ?? []).join('\n'),
  networkPassphrase: c.networkPassphrase ?? '',
  badgesContractAddress: c.badgesContractAddress ?? '',
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

  const buildPayload = (): ProjectConfigPayload => ({
    networkName: form.networkName.trim(),
    origins: form.origins
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean),
    networkPassphrase: orNull(form.networkPassphrase),
    badgesContractAddress: orNull(form.badgesContractAddress),
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
