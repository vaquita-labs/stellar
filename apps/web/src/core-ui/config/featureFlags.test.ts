import { describe, expect, it } from 'vitest';
import { isInstallPromptEnabled, isPassiveVaultEnabled } from './featureFlags';

describe('isPassiveVaultEnabled', () => {
  it('is off by default when the env flag is unset (dark launch)', () => {
    // vitest.config.ts intentionally leaves NEXT_PUBLIC_PASSIVE_VAULT_ENABLED unset.
    expect(isPassiveVaultEnabled()).toBe(false);
  });
});

describe('isInstallPromptEnabled', () => {
  it('is off when the env flag is unset, so the install screen never blocks', () => {
    // vitest.config.ts intentionally leaves NEXT_PUBLIC_INSTALL_PROMPT_ENABLED unset.
    expect(isInstallPromptEnabled()).toBe(false);
  });
});
