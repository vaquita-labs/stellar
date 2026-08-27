import { describe, expect, it } from 'vitest';
import { isBoliviaOnrampEnabled, isInstallPromptEnabled, isPassiveVaultEnabled } from './featureFlags';

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

describe('isBoliviaOnrampEnabled', () => {
  it('is off when the env flag is unset, so Bolivia stays "coming soon"', () => {
    // vitest.config.ts intentionally leaves NEXT_PUBLIC_BOLIVIA_ONRAMP_ENABLED unset.
    expect(isBoliviaOnrampEnabled()).toBe(false);
  });
});
