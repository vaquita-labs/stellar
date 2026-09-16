import { describe, expect, it } from 'vitest';
import { openAfterCheck, settledOnReopen, shouldKeepWatching, WATCH_WINDOW_MS } from './rampReopen';

const row = (providerTxId: string) => ({ id: providerTxId, providerTxId });

describe('settledOnReopen', () => {
  it('closes only the rows the provider says completed', () => {
    const rows = [row('a'), row('b'), row('c'), row('d')];
    const statuses = new Map<string, string | null>([
      ['a', 'completed'],
      ['b', 'pending'],
      ['c', 'processing'],
      ['d', 'failed'],
    ]);
    expect(settledOnReopen(rows, statuses)).toEqual([row('a')]);
  });

  it('says nothing about a row whose read failed or never ran', () => {
    const statuses = new Map<string, string | null>([['a', null]]);
    expect(settledOnReopen([row('a'), row('b')], statuses)).toEqual([]);
  });

  it('ignores a row with no provider id to ask about', () => {
    const statuses = new Map<string, string | null>([['', 'completed']]);
    expect(settledOnReopen([row('')], statuses)).toEqual([]);
  });
});

describe('openAfterCheck', () => {
  it('keeps the rows whose answer can still change', () => {
    const rows = [row('a'), row('b'), row('c'), row('d')];
    const statuses = new Map<string, string | null>([
      ['a', 'pending'],
      ['b', 'processing'],
      ['c', 'completed'],
      ['d', 'failed'],
    ]);
    expect(openAfterCheck(rows, statuses)).toEqual([row('a'), row('b')]);
  });

  it('drops a row we could not read, so an unreachable provider is not polled forever', () => {
    const statuses = new Map<string, string | null>([['a', null]]);
    expect(openAfterCheck([row('a'), row('b')], statuses)).toEqual([]);
  });
});

describe('shouldKeepWatching', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  const madeAgo = (ms: number) => ({ createdAt: new Date(now.getTime() - ms).toISOString() });

  it('watches a row the user could still be paying', () => {
    expect(shouldKeepWatching([madeAgo(WATCH_WINDOW_MS - 1)], now)).toBe(true);
  });

  it('stops on a row nobody paid within the window', () => {
    expect(shouldKeepWatching([madeAgo(WATCH_WINDOW_MS + 1)], now)).toBe(false);
  });

  it('keeps watching while any one row is recent', () => {
    expect(shouldKeepWatching([madeAgo(WATCH_WINDOW_MS + 1), madeAgo(1_000)], now)).toBe(true);
  });

  it('has nothing to watch with no rows, or with a date the server did not send', () => {
    expect(shouldKeepWatching([], now)).toBe(false);
    expect(shouldKeepWatching([{ createdAt: '' }], now)).toBe(false);
  });
});
