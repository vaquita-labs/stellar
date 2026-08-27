import { clientEnv } from './clientEnv';

/**
 * Passive deposits via the DeFindex vault. Dark-by-default: only "true" enables
 * it, so the vault read/deposit/withdraw/migration slices ship invisibly and the
 * rollout is flipped by setting NEXT_PUBLIC_PASSIVE_VAULT_ENABLED=true at build
 * time (its absence keeps prod on the legacy direct-to-Blend path).
 */
export const isPassiveVaultEnabled = (): boolean =>
  clientEnv.NEXT_PUBLIC_PASSIVE_VAULT_ENABLED === 'true';

/**
 * The "add the app to your home screen" step mobile users hit on the login
 * screen, after the intro and BEFORE logging in (installing first avoids the
 * iOS double login — the installed app doesn't share the browser's session).
 * Not blocking: it offers "continue in the browser". Off-by-default: only
 * "true" enables it, so an unset or empty NEXT_PUBLIC_INSTALL_PROMPT_ENABLED
 * means nobody is ever interrupted by it. The manual "Install app" row in
 * Settings is unaffected — it stays available regardless of this flag.
 */
export const isInstallPromptEnabled = (): boolean =>
  clientEnv.NEXT_PUBLIC_INSTALL_PROMPT_ENABLED === 'true';

/**
 * The Bolivia (BOB) on-ramp: buy USDC with bolivianos by paying a QR with any
 * Bolivian bank app. Dark-by-default, so the country stays greyed out in the
 * deposit picker until NEXT_PUBLIC_BOLIVIA_ONRAMP_ENABLED=true is set at build
 * time. The corridor is MAINNET-ONLY — the provider publishes nothing on
 * testnet — so a testnet build with the flag on can open the modal but will
 * never get a quote.
 */
export const isBoliviaOnrampEnabled = (): boolean =>
  clientEnv.NEXT_PUBLIC_BOLIVIA_ONRAMP_ENABLED === 'true';
