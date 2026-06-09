// Configuración declarativa del tutorial interactivo de primera vez.
//
// Para cambiar el flujo en el futuro solo se edita este archivo: el orden, el
// copy de cada paso en TUTORIAL_STEPS, y los números de la simulación en las
// constantes de abajo. El motor (TutorialExperience.tsx) reacciona al `kind` de
// cada paso, así que agregar/quitar/reordenar pasos NO requiere tocar la lógica
// mientras se reutilicen los `kind` existentes.
//
// Importante: el tutorial es un sandbox guiado, NO hace transacciones reales.
// Reutiliza los modales reales de depósito y retiro (en modo `simulate`) para
// que el usuario reconozca la UI cuando entre a la app.

// Cómo renderiza el overlay cada paso:
// - message  → tarjeta + botón para avanzar.
// - warn     → tarjeta + caja de aviso roja + botón.
// - spotlight→ tarjeta + resalta un botón REAL; se avanza tocándolo (sin botón).
// - waiting  → tarjeta + (HUD del cronómetro arriba a la derecha); auto-avanza.
// - success  → tarjeta + recibo + botón final.
// - coach    → NO hay tarjeta centrada (ocurre con un modal real abierto): el
//              motor oscurece todo menos un elemento y muestra una tarjetita
//              guía (con los dots de progreso) pegada a él. El `bodyKey` es el
//              mensaje y `id` decide qué elemento resaltar.
export type TutorialStepKind = 'message' | 'deposit' | 'warn' | 'spotlight' | 'waiting' | 'success' | 'coach';

export interface TutorialStep {
  /** Id estable (para keys y para depurar). */
  id: string;
  /** Qué comportamiento/visual activa el motor. */
  kind: TutorialStepKind;
  /**
   * Claves i18n del copy (no el texto). El render las traduce con `t(...)` para
   * que el tutorial reaccione al idioma activo. El texto vive en los diccionarios.
   */
  titleKey: string;
  bodyKey: string;
  /** Clave i18n del botón principal de la tarjeta ('' = sin botón). */
  ctaKey: string;
  /** Valores de interpolación para las claves de arriba (p. ej. { seconds }). */
  params?: Record<string, string | number>;
  /**
   * Selector CSS del elemento REAL del home a resaltar con el spotlight (recorte
   * en el scrim + anillo pulsante). Si se omite, el paso solo muestra la tarjeta.
   * Anclamos por `data-tutorial="…"` en los componentes reales.
   */
  spotlight?: string;
}

// --- Parámetros de la simulación (todo lo numérico se ajusta aquí) -----------
export const TUTORIAL_CURRENCY = 'USDC';
/** Monto con el que se precarga el input de depósito (el usuario puede cambiarlo). */
export const TUTORIAL_DEFAULT_AMOUNT = 3;
/** Objetivo de ahorro del ejemplo: segundos de lock antes de poder retirar. */
export const TUTORIAL_GOAL_SECONDS = 10;
/** Lock del depósito del tutorial, en ms (lo que consume el modal de retiro). */
export const TUTORIAL_LOCK_MS = TUTORIAL_GOAL_SECONDS * 1000;
/** Tasa de interés de la demo: el interés se calcula sobre el monto depositado. */
export const TUTORIAL_INTEREST_RATE = 0.025;

/** Interés simulado para un monto dado. */
export const tutorialInterest = (amount: number) => amount * TUTORIAL_INTEREST_RATE;

// Anclas en los componentes reales del home (data-tutorial="…").
export const TUTORIAL_ANCHOR_SAVE = 'tutorial-save';
export const TUTORIAL_ANCHOR_BALANCE = 'tutorial-balance';
export const TUTORIAL_ANCHOR_VAQUITA_CARD = 'tutorial-vaquita-card';
export const TUTORIAL_ANCHOR_WITHDRAW = 'tutorial-withdraw';

/** Formato de moneda compartido por las tarjetas del tutorial. */
export const formatTutorialMoney = (n: number) =>
  `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${TUTORIAL_CURRENCY}`;

// --- Copy de los pasos `coach` (hints DENTRO de los modales reales) -----------
// Estos pasos NO muestran una tarjeta centrada: el motor (TutorialExperience)
// resalta un único elemento real por vez y muestra un hint pegado a él
// (TutorialFocusLock → misma TutorialCard que la narración). Cada uno es un paso
// más de TUTORIAL_STEPS (su propio punto de progreso), así que llevan título y
// cuerpo como cualquier otro paso. El texto vive en los diccionarios i18n.
export const TUTORIAL_COACH = {
  /** Modal de depósito: confirmar el depósito demo (sobre el botón Deposit). */
  depositConfirm: { title: 'tutorial.coach.depositConfirm.title', body: 'tutorial.coach.depositConfirm.body' },
  /** Bank Rewards: elegir la tarjeta del depósito recién hecho. */
  selectDeposit: { title: 'tutorial.coach.selectDeposit.title', body: 'tutorial.coach.selectDeposit.body' },
  /** Detalle (bloqueado): intentar retirar antes de tiempo (sobre Withdraw). */
  withdrawEarly: { title: 'tutorial.coach.withdrawEarly.title', body: 'tutorial.coach.withdrawEarly.body' },
  /** Confirmación de retiro anticipado: cancelar para esperar (sobre Cancel). */
  cancelWait: { title: 'tutorial.coach.cancelWait.title', body: 'tutorial.coach.cancelWait.body' },
  /** Contador en 0: retirar/reclamar con interés (sobre Withdraw / Claim now). */
  claimNow: { title: 'tutorial.coach.claimNow.title', body: 'tutorial.coach.claimNow.body' },
};

// Aviso "But if you wait…" que aparece TRAS cancelar el retiro anticipado y
// ANTES de arrancar el contador. Se monta como tarjeta sobre el detalle (no es
// un paso aparte). Reutiliza el copy de `waitIntro`.
export const TUTORIAL_WAIT_NOTICE = {
  titleKey: 'tutorial.steps.waitIntro.title',
  bodyKey: 'tutorial.steps.waitIntro.body',
  ctaKey: 'tutorial.steps.waitIntro.cta',
  params: { seconds: TUTORIAL_GOAL_SECONDS },
};

const SPOT_SAVE = `[data-tutorial="${TUTORIAL_ANCHOR_SAVE}"]`;
const SPOT_BALANCE = `[data-tutorial="${TUTORIAL_ANCHOR_BALANCE}"]`;

// Flujo completo, paso a paso (cada entrada = un punto de progreso). Los pasos
// `coach` ocurren DENTRO del Bank Rewards / detalle real; su `bodyKey` es el
// mensajito que se muestra pegado al elemento resaltado. El motor
// (TutorialExperience) avanza el índice al completar la interacción de cada uno.
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    kind: 'message',
    titleKey: 'tutorial.steps.welcome.title',
    bodyKey: 'tutorial.steps.welcome.body',
    ctaKey: 'tutorial.steps.welcome.cta',
  },
  {
    id: 'deposit',
    kind: 'deposit',
    spotlight: SPOT_SAVE,
    titleKey: 'tutorial.steps.deposit.title',
    bodyKey: 'tutorial.steps.deposit.body',
    ctaKey: 'tutorial.steps.deposit.cta',
  },
  {
    id: 'confirm-deposit',
    kind: 'coach',
    titleKey: TUTORIAL_COACH.depositConfirm.title,
    bodyKey: TUTORIAL_COACH.depositConfirm.body,
    ctaKey: '',
    // Monto fijo de la demo: el modal precarga este monto y queda bloqueado, así
    // que el mensaje ("Depositarás 3 USDC") coincide con lo que se deposita.
    params: { amount: TUTORIAL_DEFAULT_AMOUNT, currency: TUTORIAL_CURRENCY },
  },
  {
    id: 'open-bank',
    kind: 'spotlight',
    spotlight: SPOT_BALANCE,
    titleKey: 'tutorial.steps.findDeposit.title',
    bodyKey: 'tutorial.steps.findDeposit.body',
    ctaKey: 'tutorial.steps.findDeposit.cta',
  },
  {
    id: 'select-deposit',
    kind: 'coach',
    titleKey: TUTORIAL_COACH.selectDeposit.title,
    bodyKey: TUTORIAL_COACH.selectDeposit.body,
    ctaKey: '',
  },
  {
    id: 'withdraw-early',
    kind: 'coach',
    titleKey: TUTORIAL_COACH.withdrawEarly.title,
    bodyKey: TUTORIAL_COACH.withdrawEarly.body,
    ctaKey: '',
  },
  {
    id: 'cancel-wait',
    kind: 'coach',
    titleKey: TUTORIAL_COACH.cancelWait.title,
    bodyKey: TUTORIAL_COACH.cancelWait.body,
    ctaKey: '',
  },
  {
    id: 'claim',
    kind: 'coach',
    titleKey: TUTORIAL_COACH.claimNow.title,
    bodyKey: TUTORIAL_COACH.claimNow.body,
    ctaKey: '',
  },
  {
    id: 'success',
    kind: 'success',
    titleKey: 'tutorial.steps.success.title',
    bodyKey: 'tutorial.steps.success.body',
    ctaKey: 'tutorial.steps.success.cta',
  },
];
