'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type Campaign,
  type CampaignCreatePayload,
  buildCampaignLink,
  createCampaign,
  deleteCampaign,
  updateCampaign,
  useCampaigns,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Card, Input } from '@vaquita/ui';
import { useState } from 'react';

type FormState = {
  code: string;
  name: string;
  source: string;
  medium: string;
  content: string;
  landingPath: string;
  notes: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  source: '',
  medium: '',
  content: '',
  landingPath: '',
  notes: '',
  isActive: true,
});

const formFromCampaign = (c: Campaign): FormState => ({
  code: c.code,
  name: c.name,
  source: c.source ?? '',
  medium: c.medium ?? '',
  content: c.content ?? '',
  landingPath: c.landingPath ?? '',
  notes: c.notes ?? '',
  isActive: c.isActive,
});

// Trim; a blank field becomes null (clears the column).
const orNull = (v: string): string | null => (v.trim() ? v.trim() : null);

export default function Page() {
  const { data: campaigns, refetch, isLoading } = useCampaigns();

  // null = no form open; 'new' = create; number = editing that campaign id.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Which row's link was just copied, so the button can say so for a moment.
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setForm(emptyForm());
    setEditing('new');
  };

  const openEdit = (c: Campaign) => {
    setForm(formFromCampaign(c));
    setEditing(c.id);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const buildPayload = (): CampaignCreatePayload => ({
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    source: orNull(form.source),
    medium: orNull(form.medium),
    content: orNull(form.content),
    landingPath: orNull(form.landingPath),
    notes: orNull(form.notes),
    isActive: form.isActive,
  });

  const submit = async () => {
    setSaving(true);
    try {
      if (editing === 'new') {
        await createCampaign(buildPayload());
        addSuccessToast('Saved', 'Campaign created.');
      } else if (typeof editing === 'number') {
        await updateCampaign({ id: editing, ...buildPayload() });
        addSuccessToast('Saved', 'Campaign updated.');
      }
      await refetch();
      closeForm();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Campaign) => {
    if (!window.confirm(`Retire campaign “${c.name}” (${c.code})? Existing attributions are kept.`)) return;
    setDeletingId(c.id);
    try {
      await deleteCampaign(c.id);
      addSuccessToast('Retired', `Campaign “${c.name}” removed.`);
      if (editing === c.id) closeForm();
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const copyLink = async (c: Campaign) => {
    const link = buildCampaignLink(c);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(c.id);
      window.setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 2000);
    } catch {
      // Clipboard is permission-gated and blocked outright over plain HTTP.
      // Showing the URL is the fallback that always works.
      addDangerToast('Copy failed', link);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Button variant="primary" onPress={openCreate} isDisabled={editing === 'new'}>
          Add campaign
        </Button>
      </div>

      <p className="text-sm text-default-500">
        Each campaign owns a code. A visitor landing on <code>?ref=CODE</code> is attributed to it on first
        touch — once, and never overwritten by a later visit.
      </p>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {editing !== null && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-base font-semibold text-black">
                {editing === 'new' ? 'New campaign' : `Edit campaign #${editing}`}
              </h2>

              <div className="flex flex-wrap gap-3">
                <Input
                  label="Code"
                  containerClassName="flex-1"
                  maxLength={32}
                  placeholder="e.g. LAUNCH-AR"
                  value={form.code}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('code', e.target.value.toUpperCase())}
                />
                <Input
                  label="Name"
                  containerClassName="flex-[2]"
                  maxLength={120}
                  placeholder="e.g. Argentina launch — IG stories"
                  value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                />
              </div>

              {/* These three only prefill the generated link; whatever actually
                  arrives in the query string is what gets stored. */}
              <div className="flex flex-wrap gap-3">
                <Input
                  label="utm_source"
                  containerClassName="flex-1"
                  maxLength={60}
                  placeholder="instagram"
                  value={form.source}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('source', e.target.value)}
                />
                <Input
                  label="utm_medium"
                  containerClassName="flex-1"
                  maxLength={60}
                  placeholder="social"
                  value={form.medium}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('medium', e.target.value)}
                />
                <Input
                  label="utm_content"
                  containerClassName="flex-1"
                  maxLength={120}
                  placeholder="story-1"
                  value={form.content}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('content', e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label="Landing path"
                  containerClassName="flex-1"
                  maxLength={200}
                  placeholder="/ (default)"
                  value={form.landingPath}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('landingPath', e.target.value)}
                />
                <Input
                  label="Notes"
                  containerClassName="flex-[2]"
                  maxLength={2000}
                  placeholder="Internal note"
                  value={form.notes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('notes', e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => set('isActive', e.target.checked)}
                />
                Active — an inactive campaign stops attributing new visitors.
              </label>

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

          {(campaigns?.length ?? 0) === 0 ? (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No campaigns yet. Use “Add campaign” to create the first one.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {campaigns?.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 rounded-xl border border-black border-b-2 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.name}</span>
                        <span className="rounded bg-default-100 px-1.5 font-mono text-xs">{c.code}</span>
                        {!c.isActive && (
                          <span className="rounded bg-default-100 px-1.5 text-xs text-default-500">inactive</span>
                        )}
                      </div>
                      <span className="break-all font-mono text-xs text-default-400">{buildCampaignLink(c)}</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onPress={() => copyLink(c)}>
                        {copiedId === c.id ? 'Copied' : 'Copy link'}
                      </Button>
                      <Button size="sm" variant="ghost" onPress={() => openEdit(c)} isDisabled={saving}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onPress={() => remove(c)}
                        isDisabled={deletingId === c.id}
                        isLoading={deletingId === c.id}
                      >
                        Retire
                      </Button>
                    </div>
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
