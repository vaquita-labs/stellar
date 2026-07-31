import { describe, expect, it, vi } from 'vitest';
import { awaitCredit } from './blendDirect';

/** Poll with no delay so the credit tests stay instant. */
const FAST = { intervalMs: 0 };

/** Reader that replays `values` in order; an Error entry is thrown instead. */
const reader = (values: (number | Error)[]) => {
  let calls = 0;
  const read = async () => {
    const next = values[Math.min(calls, values.length - 1)];
    calls += 1;
    if (next instanceof Error) throw next;
    return next as number;
  };
  return { read, calls: () => calls };
};

describe('awaitCredit', () => {
  it('returns the credited amount in base units', async () => {
    const { read } = reader([150.5]);
    await expect(awaitCredit(read, 7, 100, FAST)).resolves.toBe(505_000_000n);
  });

  it('waits for a lagging reader instead of measuring zero', async () => {
    const { read, calls } = reader([100, 100, 110]);
    await expect(awaitCredit(read, 7, 100, FAST)).resolves.toBe(100_000_000n);
    expect(calls()).toBe(3);
  });

  it('retries a failing read rather than counting it as no credit', async () => {
    const { read, calls } = reader([new Error('rpc down'), new Error('rpc down'), 101]);
    await expect(awaitCredit(read, 7, 100, FAST)).resolves.toBe(10_000_000n);
    expect(calls()).toBe(3);
  });

  it('throws when the credit never shows up, so the caller cannot report success', async () => {
    const { read } = reader([100]);
    await expect(awaitCredit(read, 7, 100, { ...FAST, maxPolls: 3 })).rejects.toThrow(/wallet/i);
  });

  it('throws when every read failed', async () => {
    const { read } = reader([new Error('rpc down')]);
    await expect(awaitCredit(read, 7, 100, { ...FAST, maxPolls: 2 })).rejects.toThrow(/wallet/i);
  });

  it('never reports a credit when the balance went down', async () => {
    const { read } = reader([90]);
    await expect(awaitCredit(read, 7, 100, { ...FAST, maxPolls: 2 })).rejects.toThrow(/wallet/i);
  });

  it('floors sub-unit dust instead of rounding it up', async () => {
    // 0.00000009 USDC of drift is less than one base unit at 7 decimals.
    const { read } = reader([100.00000009]);
    await expect(awaitCredit(read, 7, 100, { ...FAST, maxPolls: 2 })).rejects.toThrow(/wallet/i);
  });

  it('reads the balance immediately, without waiting out an interval first', async () => {
    const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
    const { read } = reader([200]);
    await awaitCredit(read, 7, 100, { intervalMs: 5_000 });
    expect(sleepSpy).not.toHaveBeenCalled();
    sleepSpy.mockRestore();
  });
});
