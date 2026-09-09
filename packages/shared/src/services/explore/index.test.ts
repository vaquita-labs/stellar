import { describe, expect, it } from 'vitest';

import { isDiscoverableProfile } from './index';

describe('isDiscoverableProfile', () => {
  it('lets through a profile that picked a nickname', () => {
    expect(isDiscoverableProfile({ nickname: 'oscargauss', wallet_address: 'GAAA' })).toBe(true);
  });

  // The feed card is built from the nickname alone, so a full name never
  // reaches it: such a profile would render as `@vaqueroXXXX`, which is what
  // the filter exists to keep out. Friend suggestions accept it because their
  // DTO carries a display name.
  it('leaves out a profile whose only name is a full name', () => {
    // Built as a value and not inline: `full_name` is not part of what the
    // predicate reads, which is the whole point of the case.
    const emptyNickname = { nickname: '', full_name: 'Oscar Gauss', wallet_address: 'GAAA' };
    const noNickname = { nickname: null, full_name: 'Oscar Gauss', wallet_address: 'GAAA' };

    expect(isDiscoverableProfile(emptyNickname)).toBe(false);
    expect(isDiscoverableProfile(noNickname)).toBe(false);
  });

  // Stubs: a row exists for every wallet that ever hit the API, because
  // resolving a profile creates it.
  it('leaves out a wallet-only stub', () => {
    expect(isDiscoverableProfile({ nickname: null, wallet_address: 'GAAA' })).toBe(false);
    expect(isDiscoverableProfile({ nickname: '   ', wallet_address: 'GAAA' })).toBe(false);
  });

  it('leaves out a profile with no address to key a page on', () => {
    expect(isDiscoverableProfile({ nickname: 'oscargauss', wallet_address: '' })).toBe(false);
    expect(isDiscoverableProfile({ nickname: 'oscargauss' })).toBe(false);
  });
});
