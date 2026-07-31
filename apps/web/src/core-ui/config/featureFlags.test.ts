import { describe, expect, it } from 'vitest';
import { isPassiveVaultEnabled } from './featureFlags';

describe('isPassiveVaultEnabled', () => {
  it('is off by default when the env flag is unset (dark launch)', () => {
    // vitest.config.ts intentionally leaves NEXT_PUBLIC_PASSIVE_VAULT_ENABLED unset.
    expect(isPassiveVaultEnabled()).toBe(false);
  });
});
