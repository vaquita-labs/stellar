import { describe, expect, it } from 'vitest';
import { toDepositPlatforms } from './helpers';

const binance = {
  id: 'binance',
  name: 'Binance',
  tier: 'direct',
  network: 'stellar',
  asset: 'USDC',
  fee: '1 USDC',
  minAmount: 2,
  appUrl: 'https://www.binance.com/en',
  helpLinks: [{ id: 'withdraw', url: 'https://www.binance.com/en/support' }],
  enabled: true,
  order: 2,
};

describe('toDepositPlatforms', () => {
  it('keeps enabled entries and sorts them by order', () => {
    const meru = { ...binance, id: 'meru', name: 'Meru', order: 1 };
    expect(toDepositPlatforms([binance, meru]).map((p) => p.id)).toEqual(['meru', 'binance']);
  });

  it('hides a disabled platform', () => {
    // Takenos and Wallbit ship disabled until the bridge takes Polygon USDT.
    expect(toDepositPlatforms([{ ...binance, enabled: false }])).toEqual([]);
  });

  it('drops a malformed entry instead of failing the whole catalog', () => {
    // Hand-edited JSON: one typo must not take the boot request down.
    const out = toDepositPlatforms([{ ...binance, tier: 'sideways' }, null, 'x', binance]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('binance');
  });

  it('drops links that are not https, since they end up in an href', () => {
    const [platform] = toDepositPlatforms([
      {
        ...binance,
        appUrl: 'javascript:alert(1)',
        helpLinks: [
          { id: 'bad', url: 'http://example.com' },
          { id: 'good', url: 'https://example.com' },
        ],
      },
    ]);
    expect(platform?.appUrl).toBeNull();
    expect(platform?.helpLinks).toEqual([{ id: 'good', url: 'https://example.com' }]);
  });

  it('treats a non-array column as an empty catalog', () => {
    expect(toDepositPlatforms(null)).toEqual([]);
    expect(toDepositPlatforms({})).toEqual([]);
  });
});
