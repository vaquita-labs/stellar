'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type Reward,
  type RewardCreatePayload,
  createReward,
  deleteReward,
  updateReward,
  useRewards,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Card, Input } from '@vaquita/ui';
import { useState } from 'react';

type FormState = {
  key: string;
  name: string;
};

const emptyForm = (): FormState => ({
  key: '',
  name: '',
});

const formFromReward = (r: Reward): FormState => ({
  key: r.key ?? '',
  name: r.name ?? '',
});

// Trim; a blank field becomes null (clears the column).
const orNull = (v: string): string | null => (v.trim() ? v.trim() : null);

export default function Page() {
  const { data: rewards, refetch, isLoading } = useRewards();

  // null = no form open; 'new' = create; number = editing that reward id.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setForm(emptyForm());
    setEditing('new');
  };

  const openEdit = (r: Reward) => {
    setForm(formFromReward(r));
    setEditing(r.id);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const buildPayload = (): RewardCreatePayload => ({
    key: orNull(form.key),
    name: orNull(form.name),
  });

  const submit = async () => {
    setSaving(true);
    try {
      if (editing === 'new') {
        await createReward(buildPayload());
        addSuccessToast('Saved', 'Reward created.');
      } else if (typeof editing === 'number') {
        await updateReward({ id: editing, ...buildPayload() });
        addSuccessToast('Saved', 'Reward updated.');
      }
      await refetch();
      closeForm();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Reward) => {
    const label = r.name || r.key || `#${r.id}`;
    if (!window.confirm(`Delete reward "${label}"? This can't be undone from here.`)) {
      return;
    }
    setDeletingId(r.id);
    try {
      await deleteReward(r.id);
      addSuccessToast('Deleted', `Reward "${label}" removed.`);
      if (editing === r.id) closeForm();
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
        <h1 className="text-xl font-semibold">Rewards</h1>
        <Button variant="primary" onPress={openCreate} isDisabled={editing === 'new'}>
          Add reward
        </Button>
      </div>

      <p className="text-sm text-default-500">
        Reward types users can earn (each has a stable key and a display name).
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
                {editing === 'new' ? 'New reward' : `Edit reward #${editing}`}
              </h2>

              <div className="flex flex-wrap gap-3">
                <Input
                  label="Key"
                  containerClassName="flex-1"
                  maxLength={100}
                  placeholder="e.g. experience"
                  value={form.key}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('key', e.target.value)}
                />
                <Input
                  label="Name"
                  containerClassName="flex-1"
                  maxLength={100}
                  placeholder="e.g. Experience"
                  value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                />
              </div>

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

          {/* Reward list */}
          {(rewards?.length ?? 0) === 0 ? (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No rewards yet. Use “Add reward” to create the first one.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rewards?.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black border-b-2 bg-white p-3 shadow-sm"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.name || '(no name)'}</span>
                      {r.key && <span className="rounded bg-default-100 px-1.5 font-mono text-xs">{r.key}</span>}
                    </div>
                    <span className="text-xs text-default-400">#{r.id}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onPress={() => openEdit(r)} isDisabled={saving}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onPress={() => remove(r)}
                      isDisabled={deletingId === r.id}
                      isLoading={deletingId === r.id}
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
