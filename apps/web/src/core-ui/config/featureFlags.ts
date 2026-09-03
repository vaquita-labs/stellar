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

/**
 * Analytics. Pide LAS DOS cosas: el interruptor en "true" y una clave de
 * proyecto. Una clave sin flag es un entorno que todavía no se quiere medir; un
 * flag sin clave sería `posthog.init(undefined)`, que arranca la librería para
 * mandar todo a un proyecto que no existe. Sin las dos, nada se inicializa y la
 * app se comporta igual que antes de que el analytics existiera.
 */
export const isPostHogEnabled = (): boolean =>
  clientEnv.NEXT_PUBLIC_POSTHOG_ENABLED === 'true' && !!clientEnv.NEXT_PUBLIC_POSTHOG_KEY;

/** Host al que posthog-js manda los eventos. Ver NEXT_PUBLIC_POSTHOG_HOST. */
export const posthogHost = (): string => clientEnv.NEXT_PUBLIC_POSTHOG_HOST || '/ingest';

/**
 * Grabación de sesión. Flag propio, aparte del general, y apagado: NO se
 * prende hasta que /privacy diga que se graban sesiones, quién las guarda y por
 * cuánto tiempo. La app no tiene ningún mecanismo de consentimiento —`LegalGate`
 * es un gate de VERSIÓN de términos, no de privacidad— y el DOM tiene el saldo,
 * el valor del portafolio, la dirección de la wallet entera en "Recibir" y el
 * QR de un pago bancario real.
 *
 * Requiere además el flag general: sin PostHog inicializado no hay grabación
 * posible, y un flag que promete algo que no puede pasar confunde más de lo que
 * ayuda.
 */
export const isSessionReplayEnabled = (): boolean =>
  isPostHogEnabled() && clientEnv.NEXT_PUBLIC_SESSION_REPLAY_ENABLED === 'true';

// Los corredores de Bolivia (BOB) tuvieron un flag por punta acá. Ya no: quién
// los habilita es Pollar, y se le pregunta en vivo con `useRampCountries`
// (`networks/pollar/rampCountries.ts`). Un flag de build decía lo que nosotros
// creíamos el día del deploy — de ahí que testnet mostrara un país que no podía
// cotizar; el endpoint dice lo que el proveedor tiene habilitado hoy.
