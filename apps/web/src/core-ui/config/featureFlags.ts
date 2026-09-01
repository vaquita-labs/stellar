import { clientEnv } from './clientEnv';

/**
 * Passive deposits via the DeFindex vault. Dark-by-default: only "true" enables
 * it, so the vault read/deposit/withdraw/migration slices ship invisibly and the
 * rollout is flipped by setting NEXT_PUBLIC_PASSIVE_VAULT_ENABLED=true at build
 * time (its absence keeps prod on the legacy direct-to-Blend path).
 */
export const isPassiveVaultEnabled = (): boolean => clientEnv.NEXT_PUBLIC_PASSIVE_VAULT_ENABLED === 'true';

/**
 * The "add the app to your home screen" step mobile users hit on the login
 * screen, after the intro and BEFORE logging in (installing first avoids the
 * iOS double login — the installed app doesn't share the browser's session).
 * Not blocking: it offers "continue in the browser". Off-by-default: only
 * "true" enables it, so an unset or empty NEXT_PUBLIC_INSTALL_PROMPT_ENABLED
 * means nobody is ever interrupted by it. The manual "Install app" row in
 * Settings is unaffected — it stays available regardless of this flag.
 */
export const isInstallPromptEnabled = (): boolean => clientEnv.NEXT_PUBLIC_INSTALL_PROMPT_ENABLED === 'true';

// Los corredores de Bolivia (BOB) tuvieron un flag por punta acá. Ya no: quién
// los habilita es Pollar, y se le pregunta en vivo con `useRampCountries`
// (`networks/pollar/rampCountries.ts`). Un flag de build decía lo que nosotros
// creíamos el día del deploy — de ahí que testnet mostrara un país que no podía
// cotizar; el endpoint dice lo que el proveedor tiene habilitado hoy.
