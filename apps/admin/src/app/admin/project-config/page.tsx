'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type ProjectConfig,
  type ProjectConfigPayload,
  updateProjectConfig,
  useProjectConfig,
} from '@/core-ui/hooks';
import { Button, Spinner } from '@heroui/react';
import { useState } from 'react';

type FormState = {
  name: string;
  layer: string;
  type: string;
  smartContractEnv: string;
  origins: string;
  networkPassphrase: string;
  badgesContractAddress: string;
};

const emptyForm = (): FormState => ({
  name: '',
  layer: '',
  type: '',
  smartContractEnv: '',
  origins: '',
  networkPassphrase: '',
  badgesContractAddress: '',
});

const formFromConfig = (c: ProjectConfig): FormState => ({
  name: c.name ?? '',
  layer: c.layer ?? '',
  type: c.type ?? '',
  smartContractEnv: c.smartContractEnv ?? '',
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

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Trim; a blank field becomes null (clears the column).
  const orNull = (v: string): string | null => (v.trim() ? v.trim() : null);

  const buildPayload = (): ProjectConfigPayload => ({
    name: form.name.trim(),
    layer: orNull(form.layer),
    type: orNull(form.type),
    smartContractEnv: orNull(form.smartContractEnv),
    origins: form.origins
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean),
    networkPassphrase: orNull(form.networkPassphrase),
    badgesContractAddress: orNull(form.badgesContractAddress),
  });

  const submit = async () => {
    if (!form.name.trim()) {
      addDangerToast('Missing field', 'Name is required.');
      return;
    }
    if (form.name.trim().length > 50) {
      addDangerToast('Invalid name', 'Name must be 50 characters or fewer.');
      return;
    }
    setSaving(true);
    try {
      await updateProjectConfig(buildPayload());
      addSuccessToast('Saved', data ? 'Project configuration updated.' : 'Project configuration created.');
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Project configuration</h1>
        {data && (
          <span className="text-xs text-default-500">
            Updated {new Date(data.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      <p className="text-sm text-default-500">
        Singleton settings for the project (network, smart-contract environment, allowed origins).
      </p>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!data && (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No configuration exists yet. Saving will create the first <code>project_config</code> row.
            </div>
          )}

          <label className={inputLabel}>
            Name
            <input
              className={inputClass}
              maxLength={50}
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <label className={`flex-1 ${inputLabel}`}>
              Layer
              <input
                className={inputClass}
                maxLength={20}
                placeholder="e.g. L1"
                value={form.layer}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('layer', e.target.value)}
              />
            </label>
            <label className={`flex-1 ${inputLabel}`}>
              Type
              <input
                className={inputClass}
                maxLength={100}
                placeholder="e.g. mainnet / testnet"
                value={form.type}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('type', e.target.value)}
              />
            </label>
          </div>

          <label className={inputLabel}>
            Smart contract environment
            <input
              className={inputClass}
              maxLength={50}
              placeholder="e.g. production"
              value={form.smartContractEnv}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set('smartContractEnv', e.target.value)
              }
            />
          </label>

          <label className={inputLabel}>
            Network passphrase
            <input
              className={inputClass}
              placeholder="e.g. Public Global Stellar Network ; September 2015"
              value={form.networkPassphrase}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set('networkPassphrase', e.target.value)
              }
            />
          </label>

          <label className={inputLabel}>
            Badges contract address
            <input
              className={inputClass}
              placeholder="C..."
              value={form.badgesContractAddress}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set('badgesContractAddress', e.target.value)
              }
            />
          </label>

          <label className={inputLabel}>
            Allowed origins (one per line)
            <textarea
              className={`${inputClass} min-h-[120px] font-mono`}
              placeholder={'https://app.example.com\nhttps://admin.example.com'}
              value={form.origins}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                set('origins', e.target.value)
              }
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
              {saving ? <Spinner size="sm" color="current" /> : data ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
