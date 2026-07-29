import { clientEnv } from './clientEnv';

/**
 * Passive deposits via the DeFindex vault. Dark-by-default: only "true" enables
 * it, so the vault read/deposit/withdraw/migration slices ship invisibly and the
 * rollout is flipped by setting NEXT_PUBLIC_PASSIVE_VAULT_ENABLED=true at build
 * time (its absence keeps prod on the legacy direct-to-Blend path).
 */
export const isPassiveVaultEnabled = (): boolean =>
  clientEnv.NEXT_PUBLIC_PASSIVE_VAULT_ENABLED === 'true';
