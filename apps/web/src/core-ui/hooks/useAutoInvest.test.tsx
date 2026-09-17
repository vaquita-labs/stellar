/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  chainBalance: { current: 20_000_000n as bigint | Error },
  walletUsdc: { current: 2 as number | null },
  balanceStep: { current: 'loaded' as string },
  readUsdcBalanceRaw: vi.fn(),
  passiveDeposit: vi.fn(),
  refreshWalletBalance: vi.fn(),
  requestWalletBalanceRefresh: vi.fn(),
  invalidateAfterMoneyMove: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/networks/stellar/blendDirect', () => ({ readUsdcBalanceRaw: h.readUsdcBalanceRaw }));
vi.mock('@/networks/stellar/vaultDirect', () => ({ passiveDeposit: h.passiveDeposit }));
vi.mock('@heroui/react', () => ({ toast: { success: h.toastSuccess } }));
vi.mock('@pollar/react', () => ({
  usePollar: () => ({
    wallet: { custody: 'custodial' },
    walletBalance: { step: h.balanceStep.current },
    refreshWalletBalance: h.refreshWalletBalance,
  }),
}));
vi.mock('react-i18next', () => ({
  // `vaultError` pulls in the i18n setup through `formatBaseUnits`, and that
  // module initialises i18next at import time.
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (_key: string, fallback: string, vars?: Record<string, unknown>) =>
      vars ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars[name])) : fallback,
  }),
}));
vi.mock('./useWalletUsdc', () => ({ useWalletUsdc: () => h.walletUsdc.current }));
vi.mock('./useInvalidateAfterMoneyMove', () => ({
  useInvalidateAfterMoneyMove: () => h.invalidateAfterMoneyMove,
}));
vi.mock('./useWalletBalanceRefresh', () => ({ requestWalletBalanceRefresh: h.requestWalletBalanceRefresh }));
vi.mock('@/networks/stellar/wallet/pollarReady', () => ({
  usePollarReadyStore: (selector: (s: unknown) => unknown) => selector({ ready: true }),
}));
vi.mock('../stores', () => ({
  useConfigStore: () => ({ walletAddress: 'GTESTADDRESS', token: { code: 'USDC', decimals: 7 } }),
  useRampActiveStore: (selector: (s: unknown) => unknown) => selector({ isRampActive: false }),
  useAwaitingFundsStore: (selector: (s: unknown) => unknown) => selector({ isAwaitingFunds: false }),
  usePendingCreditStore: (selector: (s: unknown) => unknown) => selector({ pendingUntil: null }),
}));
vi.mock('@/core-ui/helpers/txError', () => ({
  humanizeTxError: () => ({ title: 'Transaction failed', raw: 'raw' }),
}));

import { useIdleFunds } from './useAutoInvest';

/** Matches ACTIVITY_REFRESH_MS in the hook. */
const ACTIVITY_REFRESH_MS = 60_000;

const invest = async () => {
  const { result } = renderHook(() => useIdleFunds());
  await act(async () => {
    await result.current.invest().catch(() => undefined);
  });
  return result;
};

/** What `passiveDeposit` was handed, which is what reaches the contract. */
const depositedAmount = () => h.passiveDeposit.mock.calls.at(-1)?.[0].amount;

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  h.walletUsdc.current = 2;
  h.balanceStep.current = 'loaded';
  h.readUsdcBalanceRaw.mockImplementation(async () => h.chainBalance.current);
  h.passiveDeposit.mockResolvedValue({ hash: 'abc123' });
  h.invalidateAfterMoneyMove.mockResolvedValue(undefined);
});

afterEach(() => {
  // This suite has no `globals: true`, so Testing Library never registers its
  // own cleanup. Without this the hook stays mounted and its `document`
  // listeners answer the next test's events as well as their own.
  cleanup();
  vi.useRealTimers();
});

describe('invest: the amount that reaches the contract', () => {
  // The hard rule: the user pressed "put it ALL to work", so anything short of
  // the whole balance is money stranded, and anything over it is a deposit the
  // account cannot cover.
  it.each([
    ['a balance with a full tail of decimals', 20_000_001n, '2.0000001'],
    ['a balance one base unit under a round number', 19_999_999n, '1.9999999'],
    ['a balance sitting exactly on the floor', 50_000n, '0.0050000'],
    ['a long, awkward fraction', 123_456_789n, '12.3456789'],
    ['a whole number', 30_000_000n, '3.0000000'],
  ])('sends %s untouched', async (_name, raw, expected) => {
    h.chainBalance.current = raw;
    await invest();
    expect(depositedAmount()).toBe(expected);
  });

  it('sends the figure the chain holds, not the one the screen is showing', async () => {
    h.walletUsdc.current = 2;
    h.chainBalance.current = 20_000_001n;

    await invest();

    expect(h.readUsdcBalanceRaw).toHaveBeenCalledWith('GTESTADDRESS');
    expect(depositedAmount()).toBe('2.0000001');
  });

  it('keeps every decimal the token carries', async () => {
    h.chainBalance.current = 20_000_001n;
    await invest();
    expect(depositedAmount()?.split('.')[1]).toHaveLength(7);
  });

  it('deposits the idle money as new money into savings', async () => {
    h.chainBalance.current = 20_000_000n;
    await invest();
    expect(h.passiveDeposit).toHaveBeenCalledWith(expect.objectContaining({ flowKind: 'external_in', decimals: 7 }));
  });
});

describe('invest: when it must not send anything', () => {
  it('says which floor applies instead of stopping in silence', async () => {
    h.chainBalance.current = 40_000n;

    const result = await invest();

    expect(h.passiveDeposit).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Minimum deposit: $0.005 USDC.');
  });

  it('never falls back to the cached figure when the chain cannot be read', async () => {
    h.readUsdcBalanceRaw.mockRejectedValue(new Error('rpc down'));

    const result = await invest();

    expect(h.passiveDeposit).not.toHaveBeenCalled();
    expect(result.current.error).toBe("We couldn't read your balance right now. Try again in a moment.");
  });

  it('tells a failed deposit apart from a balance it could not read', async () => {
    h.chainBalance.current = 20_000_000n;
    h.passiveDeposit.mockRejectedValue(new Error('contract error'));

    const result = await invest();

    expect(result.current.error).toBe('Transaction failed');
  });

  it('does nothing at all while the known balance is under the floor', async () => {
    h.walletUsdc.current = 0;

    await invest();

    expect(h.readUsdcBalanceRaw).not.toHaveBeenCalled();
    expect(h.passiveDeposit).not.toHaveBeenCalled();
  });
});

describe('the activity refresh', () => {
  const tap = () => act(() => void document.dispatchEvent(new Event('pointerdown')));

  const mountIdle = () => {
    renderHook(() => useIdleFunds());
    // The mount fetch has already run; only what activity triggers matters here.
    h.refreshWalletBalance.mockClear();
  };

  it('re-reads the balance on the first tap of the minute', () => {
    mountIdle();
    tap();
    expect(h.refreshWalletBalance).toHaveBeenCalledTimes(1);
  });

  // A tap inside a sheet is aimed at the sheet, and re-reading blanks Pollar's
  // balance under it — which closed the idle-funds screen mid-click.
  it('stays out of the way while a sheet is on screen', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    mountIdle();
    tap();

    expect(h.refreshWalletBalance).not.toHaveBeenCalled();
  });

  // The guard sits ahead of the throttle stamp, so a tap it turned away does
  // not use up the minute: closing the sheet and tapping asks straight away.
  it('does not spend the minute on a tap it ignored', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    mountIdle();
    tap();
    expect(h.refreshWalletBalance).not.toHaveBeenCalled();

    dialog.remove();
    tap();

    expect(h.refreshWalletBalance).toHaveBeenCalledTimes(1);
  });

  it('asks once a minute however often the user taps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    mountIdle();
    tap();
    tap();
    tap();

    expect(h.refreshWalletBalance).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + ACTIVITY_REFRESH_MS));
    tap();

    expect(h.refreshWalletBalance).toHaveBeenCalledTimes(2);
  });

  it('answers a key the same way it answers a tap', () => {
    mountIdle();
    act(() => void document.dispatchEvent(new Event('keydown')));
    expect(h.refreshWalletBalance).toHaveBeenCalledTimes(1);
  });
});

describe('shouldPrompt and decided', () => {
  it('offers the screen once idle money is known to be there', () => {
    h.walletUsdc.current = 2;
    const { result } = renderHook(() => useIdleFunds());
    expect(result.current.shouldPrompt).toBe(true);
    expect(result.current.decided).toBe(true);
  });

  it('does not offer it for dust below the floor', () => {
    h.walletUsdc.current = 0.001;
    expect(renderHook(() => useIdleFunds()).result.current.shouldPrompt).toBe(false);
  });

  // A failed read is terminal: nobody will ever find out, so the queue slot has
  // to be released or everything behind it waits for the rest of the session.
  it('counts a failed read as decided so the queue moves on', () => {
    h.balanceStep.current = 'error';
    h.walletUsdc.current = null;

    const { result } = renderHook(() => useIdleFunds());

    expect(result.current.decided).toBe(true);
    expect(result.current.shouldPrompt).toBe(false);
  });

  it('has not decided while the first read is still in flight', () => {
    h.balanceStep.current = 'loading';
    h.walletUsdc.current = null;

    expect(renderHook(() => useIdleFunds()).result.current.decided).toBe(false);
  });
});
