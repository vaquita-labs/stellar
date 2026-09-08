import { describe, expect, it } from 'vitest';

import { hasDisplayName, hasNickname } from './naming';

describe('hasNickname', () => {
  it('is true once a nickname is set', () => {
    expect(hasNickname({ nickname: 'oscargauss' })).toBe(true);
  });

  // A profile row exists for every wallet that ever hit the API, so the absence
  // of a nickname is what separates a person from a stub.
  it('is false for a stub, whitespace included', () => {
    expect(hasNickname({ nickname: null })).toBe(false);
    expect(hasNickname({ nickname: '' })).toBe(false);
    expect(hasNickname({ nickname: '   ' })).toBe(false);
    expect(hasNickname({})).toBe(false);
  });

  it('ignores the full name: it is not a nickname', () => {
    expect(hasNickname({ nickname: null, fullName: 'Oscar Gauss' })).toBe(false);
    expect(hasNickname({ nickname: null, full_name: 'Oscar Gauss' })).toBe(false);
  });
});

describe('hasDisplayName', () => {
  it('accepts a nickname', () => {
    expect(hasDisplayName({ nickname: 'oscargauss' })).toBe(true);
  });

  // The surfaces that use this one render a real name, so a profile that only
  // filled in a full name is still a person there.
  it('accepts a full name in either spelling', () => {
    expect(hasDisplayName({ nickname: null, fullName: 'Oscar Gauss' })).toBe(true);
    expect(hasDisplayName({ nickname: '', full_name: 'Oscar Gauss' })).toBe(true);
  });

  it('rejects a profile with no name at all', () => {
    expect(hasDisplayName({ nickname: '  ', fullName: '  ' })).toBe(false);
    expect(hasDisplayName({})).toBe(false);
  });
});
