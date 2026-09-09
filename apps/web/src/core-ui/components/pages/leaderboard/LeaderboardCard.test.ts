import { describe, expect, it } from 'vitest';
import { getLeaderboardUsername, hasPublicProfile } from './LeaderboardCard';

const WALLET = 'GCTR62LHPGRWR5FMKEW7XU3A6UXHE2FTT3TGGKSQDLNBFNYDENEB72US';

describe('hasPublicProfile', () => {
  it('is true for a profile that picked a nickname', () => {
    expect(hasPublicProfile('oscargauss')).toBe(true);
  });

  // Rows come from deposits, so a wallet that never finished onboarding earns a
  // position with no name behind it. It keeps the position; what it loses is
  // the link and the follow button.
  it('is false when there is no nickname to open a page with', () => {
    expect(hasPublicProfile('')).toBe(false);
    expect(hasPublicProfile('   ')).toBe(false);
    expect(hasPublicProfile(null)).toBe(false);
    expect(hasPublicProfile(undefined)).toBe(false);
  });

  // The fallback handle is a placeholder the card renders, never an identity:
  // treating it as one is what would point a link at a page with no one on it.
  it('does not accept the fallback handle as an identity', () => {
    const username = getLeaderboardUsername('', WALLET);

    expect(username).toBe('@vaquero72us');
    expect(hasPublicProfile(null)).toBe(false);
  });
});
