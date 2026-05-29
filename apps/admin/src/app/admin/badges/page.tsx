'use client';

import { GenericTable } from '@/core-ui/components';
import {
  type AchievementPayload,
  type AdminAchievement,
  type BadgeRuleCondition,
  type BadgeRuleOp,
  type BadgeUnlockType,
  createAchievement,
  updateAchievement,
  useAdminAchievements,
} from '@/core-ui/hooks';
import {
  addToast,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Switch,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { useMemo, useState } from 'react';

// Mirror of the backend signal registry (packages/shared/.../profile/rules.ts).
// Keep in sync: a rule can only reference a signal the backend computes.
const SIGNALS: { key: string; kind: 'number' | 'date'; label: string }[] = [
  { key: 'experience', kind: 'number', label: 'Experience (XP)' },
  { key: 'streakCount', kind: 'number', label: 'Streak (days)' },
  { key: 'activeDeposits', kind: 'number', label: 'Active deposits' },
  { key: 'activeAmount', kind: 'number', label: 'Active amount (USDC)' },
  { key: 'friendsCount', kind: 'number', label: 'Friends count' },
  { key: 'leaderboardRank', kind: 'number', label: 'Leaderboard rank' },
  { key: 'createdAt', kind: 'date', label: 'Profile created at' },
];

const NUMERIC_OPS: BadgeRuleOp[] = ['>=', '>', '<=', '<', '=='];
const DATE_OPS: BadgeRuleOp[] = ['before', 'after'];
const TIERS = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Founder'];
const UNLOCK_TYPES: { value: BadgeUnlockType; label: string }[] = [
  { value: 'rule', label: 'Rule (auto, signal-driven)' },
  { value: 'redeem_code', label: 'Redeem code' },
  { value: 'manual', label: 'Manual (admin-granted)' },
  { value: 'cycle_rank', label: 'Leaderboard (cycle rank)' },
];

const kindOf = (signal: string): 'number' | 'date' =>
  SIGNALS.find((s) => s.key === signal)?.kind ?? 'number';

const selectClass =
  'w-full rounded-medium border-2 border-default-200 bg-default-100 px-3 py-2 text-sm outline-none focus:border-default-400';

type FormState = {
  key: string;
  name: string;
  description: string;
  tier: string;
  coinReward: string;
  unlockType: BadgeUnlockType;
  icon: string;
  accent: string;
  code: string;
  displayOrder: string;
  hidden: boolean;
  enabled: boolean;
  allowTierChange: boolean;
  conditions: BadgeRuleCondition[];
};

const emptyForm = (): FormState => ({
  key: '',
  name: '',
  description: '',
  tier: 'Bronze',
  coinReward: '0',
  unlockType: 'rule',
  icon: '',
  accent: '',
  code: '',
  displayOrder: '0',
  hidden: false,
  enabled: true,
  allowTierChange: false,
  conditions: [{ signal: 'experience', op: '>=', value: 0 }],
});

const formFromAchievement = (a: AdminAchievement): FormState => ({
  key: a.key,
  name: a.name,
  description: a.description,
  tier: a.tier,
  coinReward: String(a.coin_reward ?? 0),
  unlockType: a.unlock_type,
  icon: a.icon ?? '',
  accent: a.accent ?? '',
  code: a.code ?? '',
  displayOrder: String(a.display_order ?? 0),
  hidden: !!a.hidden,
  enabled: a.enabled !== false,
  allowTierChange: false,
  conditions:
    a.rule?.all && a.rule.all.length > 0
      ? a.rule.all
      : [{ signal: 'experience', op: '>=', value: 0 }],
});

/** Visual builder for an AND-rule over the backend signals. */
const RuleBuilder = ({
  conditions,
  onChange,
}: {
  conditions: BadgeRuleCondition[];
  onChange: (next: BadgeRuleCondition[]) => void;
}) => {
  const update = (i: number, patch: Partial<BadgeRuleCondition>) => {
    const next = conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3 rounded-medium bg-default-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Unlock when ALL conditions are met</span>
        <Button
          size="sm"
          variant="flat"
          onPress={() => onChange([...conditions, { signal: 'experience', op: '>=', value: 0 }])}
        >
          + Condition
        </Button>
      </div>

      {conditions.map((c, i) => {
        const kind = kindOf(c.signal);
        const ops = kind === 'date' ? DATE_OPS : NUMERIC_OPS;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass + ' max-w-[200px]'}
              value={c.signal}
              onChange={(e) => {
                const signal = e.target.value;
                const newKind = kindOf(signal);
                // Reset op to a valid one for the new kind.
                update(i, {
                  signal,
                  op: (newKind === 'date' ? DATE_OPS : NUMERIC_OPS)[0],
                  value: newKind === 'date' ? '' : 0,
                });
              }}
            >
              {SIGNALS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              className={selectClass + ' max-w-[110px]'}
              value={c.op}
              onChange={(e) => update(i, { op: e.target.value as BadgeRuleOp })}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>

            {kind === 'date' ? (
              <Input
                size="sm"
                variant="bordered"
                className="max-w-[240px]"
                placeholder="ISO date e.g. 2026-05-17T23:59:59Z"
                value={String(c.value ?? '')}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            ) : (
              <Input
                size="sm"
                type="number"
                variant="bordered"
                className="max-w-[140px]"
                value={String(c.value ?? 0)}
                onChange={(e) => update(i, { value: Number(e.target.value) })}
              />
            )}

            {conditions.length > 1 && (
              <Button
                size="sm"
                color="danger"
                variant="light"
                onPress={() => onChange(conditions.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BadgeFormModal = ({
  isOpen,
  onClose,
  editing,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: AdminAchievement | null;
  onSaved: () => void;
}) => {
  const isEdit = !!editing;
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  // Re-seed the form whenever the modal opens for a different target.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const targetId = editing?.key ?? '__new__';
  if (isOpen && seededFor !== targetId) {
    setForm(editing ? formFromAchievement(editing) : emptyForm());
    setSeededFor(targetId);
  }
  if (!isOpen && seededFor !== null) setSeededFor(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const buildPayload = (): AchievementPayload => {
    const base: AchievementPayload = {
      name: form.name.trim(),
      description: form.description.trim(),
      tier: form.tier,
      coinReward: Number(form.coinReward) || 0,
      unlockType: form.unlockType,
      icon: form.icon.trim() || null,
      accent: form.accent.trim() || null,
      hidden: form.hidden,
      enabled: form.enabled,
      allowTierChange: form.allowTierChange,
      displayOrder: Number(form.displayOrder) || 0,
      code: form.unlockType === 'redeem_code' ? form.code.trim() || null : null,
      rule:
        form.unlockType === 'rule'
          ? {
              all: form.conditions.map((c) => ({
                signal: c.signal,
                op: c.op,
                value:
                  kindOf(c.signal) === 'date' ? String(c.value) : Number(c.value),
              })),
            }
          : null,
    };
    return base;
  };

  const submit = async () => {
    if (!form.name.trim() || !form.description.trim()) {
      addToast({ title: 'Missing fields', description: 'Name and description are required.' });
      return;
    }
    if (!isEdit && !/^[a-z0-9-]+$/.test(form.key)) {
      addToast({ title: 'Invalid key', description: 'Key must be kebab-case (a-z, 0-9, -).' });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        await updateAchievement(editing.key, buildPayload());
        addToast({ title: 'Saved', description: `Updated "${editing.key}".` });
      } else {
        await createAchievement({ key: form.key, ...buildPayload() });
        addToast({ title: 'Created', description: `Badge "${form.key}" created.` });
      }
      onSaved();
      onClose();
    } catch (err) {
      addToast({ title: 'Error', description: (err as Error)?.message ?? 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{isEdit ? `Edit badge · ${editing?.key}` : 'New badge'}</ModalHeader>
        <ModalBody className="flex flex-col gap-3">
          {!isEdit && (
            <Input
              label="Key (immutable)"
              variant="bordered"
              placeholder="e.g. summer-2026"
              value={form.key}
              onChange={(e) => set('key', e.target.value)}
            />
          )}
          <Input
            label="Name"
            variant="bordered"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <Textarea
            label="Description"
            variant="bordered"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Tier
              <select className={selectClass} value={form.tier} onChange={(e) => set('tier', e.target.value)}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <Input
              className="flex-1"
              type="number"
              label="Coin reward"
              variant="bordered"
              value={form.coinReward}
              onChange={(e) => set('coinReward', e.target.value)}
            />
            <Input
              className="flex-1"
              type="number"
              label="Display order"
              variant="bordered"
              value={form.displayOrder}
              onChange={(e) => set('displayOrder', e.target.value)}
            />
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Unlock type
            <select
              className={selectClass}
              value={form.unlockType}
              onChange={(e) => set('unlockType', e.target.value as BadgeUnlockType)}
            >
              {UNLOCK_TYPES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>

          {form.unlockType === 'rule' && (
            <RuleBuilder conditions={form.conditions} onChange={(c) => set('conditions', c)} />
          )}
          {form.unlockType === 'redeem_code' && (
            <Input
              label="Redeem code"
              variant="bordered"
              placeholder="e.g. VERANO26"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
            />
          )}
          {form.unlockType === 'cycle_rank' && (
            <p className="text-sm text-warning-600">
              Leaderboard badges use built-in rank logic tied to the standard keys
              (first/second/third-place). New cycle_rank keys won&apos;t auto-unlock.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Input
              className="flex-1"
              label="Icon (path or URL)"
              variant="bordered"
              placeholder="/icons/achievements/<key>.png"
              value={form.icon}
              onChange={(e) => set('icon', e.target.value)}
            />
            <Input
              className="flex-1"
              label="Accent (CSS gradient)"
              variant="bordered"
              value={form.accent}
              onChange={(e) => set('accent', e.target.value)}
            />
          </div>

          <div className="flex gap-6">
            <Switch isSelected={form.enabled} onValueChange={(v) => set('enabled', v)}>
              Enabled
            </Switch>
            <Switch isSelected={form.hidden} onValueChange={(v) => set('hidden', v)}>
              Hidden (until claimed)
            </Switch>
          </div>

          {isEdit && editing && form.tier !== editing.tier && (
            <div className="flex flex-col gap-1 rounded-medium bg-warning-50 p-3">
              <Switch
                isSelected={form.allowTierChange}
                onValueChange={(v) => set('allowTierChange', v)}
                color="warning"
              >
                Allow tier change
              </Switch>
              <span className="text-xs text-warning-600">
                Tier is the Soroban mint symbol — changing it can break on-chain minting for
                this badge. Enable only if you know what you&apos;re doing.
              </span>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Cancel
          </Button>
          <Button color="primary" onPress={submit} isDisabled={saving}>
            {saving ? <Spinner size="sm" color="white" /> : isEdit ? 'Save' : 'Create'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default function Page() {
  const { data, refetch, isLoading } = useAdminAchievements();
  const achievements = useMemo(() => data ?? [], [data]);
  const byKey = useMemo(
    () => new Map(achievements.map((a) => [a.key, a])),
    [achievements],
  );

  const rows = useMemo(
    () =>
      achievements.map((a) => ({
        key: a.key,
        name: a.name,
        tier: a.tier,
        unlock_type: a.unlock_type,
        coin_reward: a.coin_reward,
        display_order: a.display_order,
        enabled: String(a.enabled !== false),
        hidden: String(!!a.hidden),
      })),
    [achievements],
  );

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editing, setEditing] = useState<AdminAchievement | null>(null);

  const openCreate = () => {
    setEditing(null);
    onOpen();
  };
  const openEdit = (a: AdminAchievement | undefined) => {
    if (!a) return;
    setEditing(a);
    onOpen();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Badges</h1>
        <Button color="primary" onPress={openCreate}>
          + New badge
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <GenericTable rows={rows as unknown as Record<string, unknown>[]} refetch={refetch}>
          {(row) => (
            <Button size="sm" onPress={() => openEdit(byKey.get(String(row.key)))}>
              Edit
            </Button>
          )}
        </GenericTable>
      )}

      <BadgeFormModal isOpen={isOpen} onClose={onClose} editing={editing} onSaved={refetch} />
    </div>
  );
}
