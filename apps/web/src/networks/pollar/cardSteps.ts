import type { CardHolder, CardRequirements, CardRequirementStep } from '@pollar/core';

/**
 * A platform step the user owes before a card provider: a KYC option, a form, a
 * registry option, or (for PROVIDER_REGISTRATION) the provider itself. Each one
 * is completed in Pollar's own step modal; the card modal only routes to it.
 */
export type PendingCardStep = {
  cardProviderId: string;
  type: CardRequirementStep['type'];
  optionId: string;
  progress?: { position: number; total: number };
};

/** Why a step cannot be acted on right now; the UI turns each into copy. */
export type BlockedCardStep = 'registry-review' | 'kyc-review' | 'kyc-rejected';

const STEP_TYPES: readonly CardRequirementStep['type'][] = ['KYC', 'FORM', 'REGISTRY_CHECK', 'PROVIDER_REGISTRATION'];

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/**
 * The step a cards call named in its 409, or null for any other error. Any cards
 * call can answer this way when the app added a step after the user signed up.
 */
export function requiredCardStep(error: unknown): PendingCardStep | null {
  if (!error || typeof error !== 'object') return null;
  const { code, body } = error as { code?: unknown; body?: unknown };
  if (code !== 'SDK_CARDS_REQUIREMENT_REQUIRED' || !body || typeof body !== 'object') return null;
  const { cardProviderId, requirementType, optionId } = body as Record<string, unknown>;
  if (!nonEmpty(cardProviderId) || !nonEmpty(optionId)) return null;
  if (!STEP_TYPES.includes(requirementType as CardRequirementStep['type'])) return null;
  return { cardProviderId, type: requirementType as CardRequirementStep['type'], optionId };
}

/** The step the provider's requirements name as next. */
export function pendingFromRequirement(cardProviderId: string, next: CardRequirementStep): PendingCardStep {
  return {
    cardProviderId,
    type: next.type,
    optionId: next.optionId,
    progress: { position: next.completed + 1, total: next.total },
  };
}

/** A step held for review or rejected; null when the user can act on it. */
export function blockedCardStep(next: CardRequirementStep): BlockedCardStep | null {
  if (next.type === 'REGISTRY_CHECK' && next.status === 'pending') return 'registry-review';
  if (next.type !== 'KYC') return null;
  if (next.status === 'pending' && next.reviewReason) return 'kyc-review';
  if (next.status === 'rejected') return 'kyc-rejected';
  return null;
}

/**
 * Which part of the card flow the user is at before the provider has their KYC:
 * `steps` while nobody signed them up or the platform's steps are pending,
 * `provider-form` when the provider's own KYC form is theirs to fill, null past
 * both or while the holder or the requirements are loading.
 *
 * A holder signed up before the app added steps still owes them. With a
 * PROVIDER_REGISTRATION step the platform sends the provider's KYC itself, so the
 * provider's form never shows; a holder still NOT_STARTED there stays on `steps`,
 * whose action re-reads where the user stands, instead of a blank modal.
 */
export function cardStage(
  holder: Pick<CardHolder, 'kycStatus'> | null | undefined,
  requirements: Pick<CardRequirements, 'steps' | 'next'> | null | undefined,
): 'steps' | 'provider-form' | null {
  if (holder === undefined || requirements === undefined) return null;
  if (holder === null || (holder.kycStatus === 'NOT_STARTED' && requirements?.next)) return 'steps';
  if (holder.kycStatus !== 'NOT_STARTED') return null;
  return requirements?.steps.some((step) => step.type === 'PROVIDER_REGISTRATION') ? 'steps' : 'provider-form';
}
