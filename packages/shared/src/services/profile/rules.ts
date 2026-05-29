/**
 * Configurable badge rules engine.
 *
 * The admin panel stores a JSON `rule` per badge (see `achievements.rule`) and
 * the backend evaluates it against the live eligibility signals produced by
 * {@link EligibilitySignals}. This decouples *thresholds and combinations* from
 * code so adding a badge like "XP >= 500 AND streak >= 14" needs no redeploy.
 *
 * IMPORTANT — the signal vocabulary is fixed by code. A rule can only reference
 * a signal listed in {@link SIGNAL_REGISTRY}; a brand-new signal still requires
 * a backend change (to compute it) before a rule can use it. The registry is
 * the single allow-list shared by both the evaluator and the Zod validator, so
 * the admin can never persist a rule that references a signal we can't resolve.
 */
import { z } from 'zod';

import type { BadgeRule, BadgeRuleCondition, BadgeRuleOp } from '../../types/interfaces';
import type { AchievementWriteFields, EligibilitySignals } from './index';

type SignalKind = 'number' | 'date';

/**
 * Allow-list of signals a rule may reference, mapped to how they are read off
 * an {@link EligibilitySignals} object. Keys MUST match `EligibilitySignals`
 * field names. To expose a new signal: compute it in `computeEligibilitySignals`,
 * add the field to `EligibilitySignals`, then register it here.
 */
export const SIGNAL_REGISTRY: Record<string, { kind: SignalKind }> = {
  createdAt: { kind: 'date' },
  experience: { kind: 'number' },
  streakCount: { kind: 'number' },
  activeDeposits: { kind: 'number' },
  activeAmount: { kind: 'number' },
  friendsCount: { kind: 'number' },
  leaderboardRank: { kind: 'number' },
};

const NUMERIC_OPS: BadgeRuleOp[] = ['>=', '>', '<=', '<', '=='];
const DATE_OPS: BadgeRuleOp[] = ['before', 'after'];

/** The operators valid for a given signal kind. */
export const opsForKind = (kind: SignalKind): BadgeRuleOp[] =>
  kind === 'date' ? DATE_OPS : NUMERIC_OPS;

const compareNumber = (left: number, op: BadgeRuleOp, right: number): boolean => {
  switch (op) {
    case '>=':
      return left >= right;
    case '>':
      return left > right;
    case '<=':
      return left <= right;
    case '<':
      return left < right;
    case '==':
      return left === right;
    default:
      return false;
  }
};

/**
 * Evaluate a single condition. Returns `false` defensively when the signal is
 * unknown, the value is missing (e.g. `leaderboardRank` outside a cycle), or the
 * operator doesn't match the signal kind — a malformed rule never unlocks a
 * badge for everyone.
 */
const evaluateCondition = (signals: EligibilitySignals, cond: BadgeRuleCondition): boolean => {
  const meta = SIGNAL_REGISTRY[cond.signal];
  if (!meta) return false;

  const raw = (signals as unknown as Record<string, unknown>)[cond.signal];

  if (meta.kind === 'date') {
    if (!DATE_OPS.includes(cond.op)) return false;
    if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return false;
    const target = new Date(String(cond.value));
    if (Number.isNaN(target.getTime())) return false;
    // `before` is inclusive (<=) to preserve the original beta-tester cutoff
    // semantics (`createdAt <= BETA_TESTER_CUTOFF`).
    return cond.op === 'before'
      ? raw.getTime() <= target.getTime()
      : raw.getTime() >= target.getTime();
  }

  // number
  if (!NUMERIC_OPS.includes(cond.op)) return false;
  if (typeof raw !== 'number' || Number.isNaN(raw)) return false;
  if (typeof cond.value !== 'number') return false;
  return compareNumber(raw, cond.op, cond.value);
};

/**
 * Evaluate a full rule against the signals. Currently an AND over `rule.all`.
 * An absent or empty rule returns `false` — a 'rule' badge with no conditions
 * must not unlock for everyone.
 */
export const evaluateRule = (
  rule: BadgeRule | null | undefined,
  signals: EligibilitySignals,
): boolean => {
  if (!rule || !Array.isArray(rule.all) || rule.all.length === 0) return false;
  return rule.all.every((cond) => evaluateCondition(signals, cond));
};

// ---------------------------------------------------------------------------
// Validation (used by the admin CRUD before persisting a rule).
// ---------------------------------------------------------------------------

const ruleConditionSchema = z
  .object({
    signal: z.string(),
    op: z.enum(['>=', '>', '<=', '<', '==', 'before', 'after']),
    value: z.union([z.number(), z.string()]),
  })
  .superRefine((cond, ctx) => {
    const meta = SIGNAL_REGISTRY[cond.signal];
    if (!meta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown signal "${cond.signal}". Allowed: ${Object.keys(SIGNAL_REGISTRY).join(', ')}.`,
        path: ['signal'],
      });
      return;
    }
    if (!opsForKind(meta.kind).includes(cond.op)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Operator "${cond.op}" is not valid for ${meta.kind} signal "${cond.signal}".`,
        path: ['op'],
      });
    }
    if (meta.kind === 'number' && typeof cond.value !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Signal "${cond.signal}" expects a numeric value.`,
        path: ['value'],
      });
    }
    if (meta.kind === 'date') {
      if (typeof cond.value !== 'string' || Number.isNaN(new Date(cond.value).getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Signal "${cond.signal}" expects an ISO date string.`,
          path: ['value'],
        });
      }
    }
  });

/** Zod schema for a badge rule. Reject empty `all` — see {@link evaluateRule}. */
export const badgeRuleSchema = z.object({
  all: z.array(ruleConditionSchema).min(1),
});

/** Parse + validate an unknown value as a {@link BadgeRule}, throwing on error. */
export const parseBadgeRule = (input: unknown): BadgeRule =>
  badgeRuleSchema.parse(input) as BadgeRule;

// ---------------------------------------------------------------------------
// Admin payload validation (used by the admin CRUD route). Lives here so the
// API doesn't need a direct `zod` dependency — the route just imports the
// compiled schemas + the row mapper.
// ---------------------------------------------------------------------------

const unlockTypeSchema = z.enum(['rule', 'redeem_code', 'manual', 'cycle_rank']);

// camelCase on the wire; mapped to snake_case columns by {@link achievementPayloadToRow}.
const editableShape = {
  name: z.string().min(1),
  description: z.string().min(1),
  tier: z.string().min(1),
  coinReward: z.number().int().min(0),
  unlockType: unlockTypeSchema,
  rule: badgeRuleSchema.nullable(),
  icon: z.string().min(1).nullable(),
  accent: z.string().min(1).nullable(),
  code: z.string().min(1).nullable(),
  hidden: z.boolean(),
  displayOrder: z.number().int(),
  enabled: z.boolean(),
};

/** A validated admin payload (create sends most fields; patch sends a subset). */
export type AchievementAdminPayload = Partial<{
  name: string;
  description: string;
  tier: string;
  coinReward: number;
  unlockType: z.infer<typeof unlockTypeSchema>;
  rule: BadgeRule | null;
  icon: string | null;
  accent: string | null;
  code: string | null;
  hidden: boolean;
  displayOrder: number;
  enabled: boolean;
}>;

// Cross-field rules, enforced only on the fields actually present so the same
// refinement works for both create (full) and patch (partial) payloads.
const refineEditable = (
  v: { unlockType?: string | undefined; rule?: unknown; code?: unknown },
  ctx: z.RefinementCtx,
) => {
  if (v.unlockType === 'rule' && v.rule === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'rule is required when unlockType is "rule".', path: ['rule'] });
  }
  if (v.unlockType === 'redeem_code' && v.code === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'code is required when unlockType is "redeem_code".', path: ['code'] });
  }
};

/** Schema for creating a badge. `key` is required + immutable; optional fields
 *  fall back to DB defaults. */
export const achievementCreateSchema = z
  .object({
    key: z.string().min(1).regex(/^[a-z0-9-]+$/, 'key must be kebab-case (a-z, 0-9, -)'),
    ...editableShape,
  })
  .partial({
    rule: true,
    icon: true,
    accent: true,
    code: true,
    hidden: true,
    displayOrder: true,
    enabled: true,
    coinReward: true,
  })
  .superRefine(refineEditable);

/** Schema for patching a badge — every field optional. */
export const achievementUpdateSchema = z.object(editableShape).partial().superRefine(refineEditable);

/** Map a validated camelCase payload to snake_case DB columns. `cycle_scoped`
 *  is kept consistent with `unlock_type` for the legacy claim-route branch. */
export const achievementPayloadToRow = (
  v: AchievementAdminPayload,
): Partial<AchievementWriteFields> => ({
  ...(v.name !== undefined && { name: v.name }),
  ...(v.description !== undefined && { description: v.description }),
  ...(v.tier !== undefined && { tier: v.tier }),
  ...(v.coinReward !== undefined && { coin_reward: v.coinReward }),
  ...(v.unlockType !== undefined && { unlock_type: v.unlockType }),
  ...(v.rule !== undefined && { rule: v.rule }),
  ...(v.icon !== undefined && { icon: v.icon }),
  ...(v.accent !== undefined && { accent: v.accent }),
  ...(v.code !== undefined && { code: v.code }),
  ...(v.hidden !== undefined && { hidden: v.hidden }),
  ...(v.displayOrder !== undefined && { display_order: v.displayOrder }),
  ...(v.enabled !== undefined && { enabled: v.enabled }),
  ...(v.unlockType !== undefined && { cycle_scoped: v.unlockType === 'cycle_rank' }),
});
