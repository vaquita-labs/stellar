import type { CardRequirementStep } from '@pollar/core';
import { describe, expect, it } from 'vitest';
import { blockedCardStep, cardStage, pendingFromRequirement, requiredCardStep } from './cardSteps';

const step = (over: Partial<CardRequirementStep> = {}): CardRequirementStep => ({
  position: 1,
  completed: 0,
  total: 2,
  type: 'KYC',
  optionId: 'opt-1',
  status: 'none',
  ...over,
});

describe('requiredCardStep', () => {
  it('reads the step a 409 names', () => {
    const error = {
      code: 'SDK_CARDS_REQUIREMENT_REQUIRED',
      body: { cardProviderId: 'cp-1', requirementType: 'FORM', optionId: 'form-1' },
    };
    expect(requiredCardStep(error)).toEqual({ cardProviderId: 'cp-1', type: 'FORM', optionId: 'form-1' });
  });

  it('ignores other errors and unknown step types', () => {
    expect(requiredCardStep(new Error('boom'))).toBeNull();
    expect(requiredCardStep({ code: 'SDK_CARDS_PROVIDER_ERROR', body: {} })).toBeNull();
    expect(
      requiredCardStep({
        code: 'SDK_CARDS_REQUIREMENT_REQUIRED',
        body: { cardProviderId: 'cp-1', requirementType: 'SELFIE', optionId: 'x' },
      }),
    ).toBeNull();
    expect(
      requiredCardStep({
        code: 'SDK_CARDS_REQUIREMENT_REQUIRED',
        body: { cardProviderId: ' ', requirementType: 'KYC', optionId: 'x' },
      }),
    ).toBeNull();
  });
});

describe('pendingFromRequirement', () => {
  it('counts the step about to start as the next position', () => {
    expect(pendingFromRequirement('cp-1', step({ completed: 1, total: 3 })).progress).toEqual({ position: 2, total: 3 });
  });
});

describe('blockedCardStep', () => {
  it('blocks a registry check under review', () => {
    expect(blockedCardStep(step({ type: 'REGISTRY_CHECK', status: 'pending' }))).toBe('registry-review');
  });

  it('blocks a KYC under manual review or rejected', () => {
    expect(blockedCardStep(step({ status: 'pending', reviewReason: 'manual' }))).toBe('kyc-review');
    expect(blockedCardStep(step({ status: 'rejected' }))).toBe('kyc-rejected');
  });

  it('lets the user act on anything else', () => {
    expect(blockedCardStep(step({ status: 'pending' }))).toBeNull();
    expect(blockedCardStep(step({ type: 'FORM', status: 'rejected' }))).toBeNull();
  });
});

describe('cardStage', () => {
  const noSteps = { steps: [], next: null };

  it('waits while the holder or the requirements load', () => {
    expect(cardStage(undefined, noSteps)).toBeNull();
    expect(cardStage(null, undefined)).toBeNull();
  });

  it('starts on the steps before the user is signed up', () => {
    expect(cardStage(null, noSteps)).toBe('steps');
    expect(cardStage(null, null)).toBe('steps');
  });

  it('keeps a signed-up holder on the steps it still owes', () => {
    expect(cardStage({ kycStatus: 'NOT_STARTED' }, { steps: [], next: step() })).toBe('steps');
  });

  it('shows the provider form when no registration step sends the KYC', () => {
    expect(cardStage({ kycStatus: 'NOT_STARTED' }, noSteps)).toBe('provider-form');
  });

  it('never shows the provider form when a registration step exists', () => {
    const requirements = {
      steps: [{ position: 1, type: 'PROVIDER_REGISTRATION' as const, optionIds: ['cp-1'], completed: true }],
      next: null,
    };
    expect(cardStage({ kycStatus: 'NOT_STARTED' }, requirements)).toBe('steps');
  });

  it('leaves the stage once the provider has the KYC', () => {
    expect(cardStage({ kycStatus: 'PENDING' }, noSteps)).toBeNull();
    expect(cardStage({ kycStatus: 'APPROVED' }, noSteps)).toBeNull();
  });
});
