'use client';

import { addDangerToast, addSuccessToast, AppModal, GenericTable } from '@/core-ui/components';
import {
  type AdminMapObject,
  createMapObject,
  deleteMapObject,
  type MapObjectVariant,
  updateMapObject,
  useMapObjects,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Input, Select } from '@vaquita/ui';
import { useMemo, useState } from 'react';

// Mirror of MapObjectType (apps/web/src/core-ui/types/commons.ts) minus
// `empty` (the null tile). Keep in sync with the API route's enum.
const MAP_OBJECT_TYPES = ['grass', 'water', 'bush', 'rock', 'tree', 'road', 'bank', 'barn', 'leaderboard', 'clock'];

// The form keeps every field as a string; numbers are parsed in buildVariants.
type VariantRowState = { variant: string; price: string; freeItems: string };

type FormState = {
  type: string;
  size: string;
  rows: VariantRowState[];
};

const emptyRow = (): VariantRowState => ({ variant: '0', price: '0', freeItems: '0' });

const emptyForm = (): FormState => ({ type: 'grass', size: '0,0,0', rows: [emptyRow()] });

const formFromMapObject = (o: AdminMapObject): FormState => ({
  type: o.type,
  size: o.size,
  rows: o.variants.map((v) => ({
    variant: String(v.variant),
    price: String(v.price),
    freeItems: String(v.freeItems),
  })),
});

/** Editor for the variant rows (variant number, price, free units). */
const VariantRowsEditor = ({
  rows,
  onChange,
}: {
  rows: VariantRowState[];
  onChange: (next: VariantRowState[]) => void;
}) => {
  const update = (i: number, patch: Partial<VariantRowState>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/15 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-black">Variants</span>
        <Button size="sm" variant="secondary" onPress={() => onChange([...rows, emptyRow()])}>
          + Variant
        </Button>
      </div>

      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <Input
            label="Variant"
            containerClassName="max-w-[110px]"
            type="number"
            value={r.variant}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { variant: e.target.value })}
          />
          <Input
            label="Price (gold)"
            containerClassName="max-w-[140px]"
            type="number"
            value={r.price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { price: e.target.value })}
          />
          <Input
            label="Free items"
            containerClassName="max-w-[140px]"
            type="number"
            value={r.freeItems}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(i, { freeItems: e.target.value })}
          />
          {rows.length > 1 && (
            <Button size="sm" variant="danger" onPress={() => onChange(rows.filter((_, idx) => idx !== i))}>
              Remove
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

// Parses and validates the string form rows. Returns an error message instead
// of a payload when a row is invalid, so the caller can toast it.
const buildVariants = (rows: VariantRowState[]): { variants?: MapObjectVariant[]; error?: string } => {
  const variants: MapObjectVariant[] = [];
  for (const row of rows) {
    const variant = Number(row.variant);
    const price = Number(row.price);
    const freeItems = Number(row.freeItems);
    if (!Number.isInteger(variant) || variant < 0 || variant > 100) {
      return { error: 'Each variant must be an integer between 0 and 100.' };
    }
    if (!Number.isFinite(price) || price < 0) {
      return { error: 'Each price must be a number ≥ 0.' };
    }
    if (!Number.isInteger(freeItems) || freeItems < 0) {
      return { error: 'Free items must be an integer ≥ 0.' };
    }
    variants.push({ variant, price, freeItems });
  }
  if (new Set(variants.map((v) => v.variant)).size !== variants.length) {
    return { error: 'Variant numbers must be unique.' };
  }
  return { variants };
};

const MapObjectFormModal = ({
  isOpen,
  onClose,
  editing,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: AdminMapObject | null;
  onSaved: () => void;
}) => {
  const isEdit = !!editing;
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  // Re-seed the form whenever the modal opens for a different target.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const targetId = editing ? String(editing.id) : '__new__';
  if (isOpen && seededFor !== targetId) {
    setForm(editing ? formFromMapObject(editing) : emptyForm());
    setSeededFor(targetId);
  }
  if (!isOpen && seededFor !== null) setSeededFor(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!/^\d+(?:\.\d+)?,\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(form.size.trim())) {
      addDangerToast('Invalid size', 'Size must be a "x,y,z" CSV triple, e.g. 0,0,0.');
      return;
    }
    const { variants, error } = buildVariants(form.rows);
    if (error || !variants) {
      addDangerToast('Invalid variants', error ?? 'Check the variant rows.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateMapObject({ id: editing.id, type: form.type, size: form.size.trim(), variants });
        addSuccessToast('Saved', `Updated "${form.type}" (#${editing.id}).`);
      } else {
        await createMapObject({ type: form.type, size: form.size.trim(), variants });
        addSuccessToast('Created', `Map object "${form.type}" created.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={isOpen}
      onOpenChange={() => onClose()}
      size="lg"
      title={isEdit ? `Edit map object · #${editing?.id}` : 'New map object'}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={submit} isDisabled={saving} isLoading={saving}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Select
            label="Type"
            containerClassName="flex-1"
            value={form.type}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('type', e.target.value)}
          >
            {MAP_OBJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input
            label="Size (x,y,z)"
            containerClassName="flex-1"
            value={form.size}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('size', e.target.value)}
          />
        </div>

        <VariantRowsEditor rows={form.rows} onChange={(rows) => set('rows', rows)} />

        <p className="text-xs text-black/60">
          A price of 0 makes the variant unbuyable; free items are the units every user gets without purchase.
        </p>
      </div>
    </AppModal>
  );
};

export default function Page() {
  const { data, refetch, isLoading } = useMapObjects();
  const mapObjects = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map(mapObjects.map((o) => [o.id, o])), [mapObjects]);

  const rows = useMemo(
    () =>
      mapObjects.map((o) => ({
        id: o.id,
        type: o.type,
        variants: o.variants.map((v) => v.variant).join(', '),
        prices: o.variants.map((v) => v.price).join(', '),
        free_items: o.variants.map((v) => v.freeItems).join(', '),
        size: o.size,
      })),
    [mapObjects]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<AdminMapObject | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const openCreate = () => {
    setEditing(null);
    setIsOpen(true);
  };
  const openEdit = (o: AdminMapObject | undefined) => {
    if (!o) return;
    setEditing(o);
    setIsOpen(true);
  };

  const remove = async (o: AdminMapObject | undefined) => {
    if (!o) return;
    if (!window.confirm(`Delete map object "${o.type}" (#${o.id})? It disappears from the user-facing catalog.`))
      return;
    setDeletingId(o.id);
    try {
      await deleteMapObject(o.id);
      addSuccessToast('Deleted', `Map object "${o.type}" removed from the catalog.`);
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Map objects</h1>
        <Button variant="primary" onPress={openCreate}>
          + New map object
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <GenericTable rows={rows as unknown as Record<string, unknown>[]} refetch={refetch}>
          {(row) => {
            // GenericTable passes the parsed row, where each field is
            // { value, original, truncated } — not the raw value. Recover the id.
            const id = Number((row.id as { value?: unknown } | undefined)?.value ?? row.id);
            const mapObject = byId.get(id);
            return (
              <div className="flex gap-2">
                <Button size="sm" onPress={() => openEdit(mapObject)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  isDisabled={deletingId !== null}
                  isLoading={deletingId === id}
                  onPress={() => remove(mapObject)}
                >
                  Delete
                </Button>
              </div>
            );
          }}
        </GenericTable>
      )}

      <MapObjectFormModal isOpen={isOpen} onClose={() => setIsOpen(false)} editing={editing} onSaved={refetch} />
    </div>
  );
}
