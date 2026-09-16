import { describe, expect, it } from 'vitest';
import { settledOnReopen } from './rampReopen';

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
