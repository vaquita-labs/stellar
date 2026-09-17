/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { MIN_IDLE_USDC } from '../helpers/numbers';
import { dismissVaultPrompt, markVaultInvestSettling, observeVaultIdle, useVaultPromptStore } from './vault-prompt';

/** Mirrors DISMISS_KEY in the store. */
const DISMISS_KEY = 'vaquita:vault-prompt-dismissed-at';

const reset = () => {
  window.sessionStorage.clear();
  useVaultPromptStore.setState({ dismissed: false, lastIdle: null, settling: false });
};

beforeEach(reset);

describe('observeVaultIdle', () => {
  it('takes the first reading as a starting point, not as an arrival', () => {
    expect(observeVaultIdle(2)).toBe(false);
    expect(useVaultPromptStore.getState().lastIdle).toBe(2);
  });

  it('reports an arrival once the balance rises', () => {
    observeVaultIdle(2);
    expect(observeVaultIdle(5)).toBe(true);
    expect(useVaultPromptStore.getState().lastIdle).toBe(5);
  });

  it('ignores a rise inside the one-cent epsilon', () => {
    observeVaultIdle(2);
    expect(observeVaultIdle(2.005)).toBe(false);
  });

  it('is not an arrival when the balance stays put', () => {
    observeVaultIdle(2);
    expect(observeVaultIdle(2)).toBe(false);
  });

  it('is not an arrival when the balance falls', () => {
    observeVaultIdle(5);
    expect(observeVaultIdle(2)).toBe(false);
  });

  it('re-arms a screen the user had closed, because the money is new', () => {
    observeVaultIdle(2);
    dismissVaultPrompt();

    expect(observeVaultIdle(5)).toBe(true);
    expect(useVaultPromptStore.getState().dismissed).toBe(false);
    expect(window.sessionStorage.getItem(DISMISS_KEY)).toBeNull();
  });

  it('leaves a dismissal alone while no new money lands', () => {
    observeVaultIdle(2);
    dismissVaultPrompt();

    observeVaultIdle(2);

    expect(useVaultPromptStore.getState().dismissed).toBe(true);
    expect(window.sessionStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  // The contract this store depends on, and the reason `AutoInvest` folds in
  // KNOWN balances only: a reading it cannot vouch for looks like the money
  // leaving, and the recovery then looks like a deposit that never happened.
  // That is what a `loading` or `error` step collapsed to 0 used to do.
  it('reads a dip to zero and back as an arrival, so unknown balances must never be folded in', () => {
    observeVaultIdle(2);
    dismissVaultPrompt();

    observeVaultIdle(0);
    expect(observeVaultIdle(2)).toBe(true);
    expect(useVaultPromptStore.getState().dismissed).toBe(false);
  });
});

describe('markVaultInvestSettling', () => {
  it('swallows the stale balance the wallet keeps reporting after a deposit', () => {
    observeVaultIdle(2);
    markVaultInvestSettling();

    expect(observeVaultIdle(2)).toBe(false);
    expect(useVaultPromptStore.getState().settling).toBe(true);
  });

  it('stops settling once the balance drops below the floor', () => {
    observeVaultIdle(2);
    markVaultInvestSettling();
    observeVaultIdle(2);

    expect(observeVaultIdle(0)).toBe(false);
    expect(useVaultPromptStore.getState().settling).toBe(false);
  });

  it('counts money that lands after the deposit settled', () => {
    observeVaultIdle(2);
    markVaultInvestSettling();
    observeVaultIdle(0);

    expect(observeVaultIdle(2)).toBe(true);
  });

  it('keeps settling while the balance is still at the floor', () => {
    observeVaultIdle(2);
    markVaultInvestSettling();

    expect(observeVaultIdle(MIN_IDLE_USDC)).toBe(false);
    expect(useVaultPromptStore.getState().settling).toBe(true);
  });
});

describe('dismissVaultPrompt', () => {
  it('records the answer in the store and in the document', () => {
    dismissVaultPrompt();

    expect(useVaultPromptStore.getState().dismissed).toBe(true);
    expect(Number(window.sessionStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0);
  });
});
