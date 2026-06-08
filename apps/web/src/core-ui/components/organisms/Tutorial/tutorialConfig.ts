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
export type TutorialStepKind = 'message' | 'deposit' | 'warn' | 'spotlight' | 'waiting' | 'success';

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
export const TUTORIAL_DEFAULT_AMOUNT = 100;
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

/**
 * Copy del aviso "Patience pays off". Ya no es un paso propio: se muestra POR
 * ENCIMA de la pantalla de confirmación de retiro anticipado (cuando el usuario
 * intenta retirar antes de tiempo dentro del banco) para empujarlo a cancelar.
 */
export const TUTORIAL_PATIENCE = {
  titleKey: 'tutorial.patience.title',
  bodyKey: 'tutorial.patience.body',
  ctaKey: 'tutorial.patience.cta',
};

const SPOT_SAVE = `[data-tutorial="${TUTORIAL_ANCHOR_SAVE}"]`;
const SPOT_BALANCE = `[data-tutorial="${TUTORIAL_ANCHOR_BALANCE}"]`;

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
    id: 'find-deposit',
    kind: 'spotlight',
    spotlight: SPOT_BALANCE,
    titleKey: 'tutorial.steps.findDeposit.title',
    bodyKey: 'tutorial.steps.findDeposit.body',
    ctaKey: 'tutorial.steps.findDeposit.cta',
  },
  {
    id: 'wait-intro',
    kind: 'message',
    titleKey: 'tutorial.steps.waitIntro.title',
    bodyKey: 'tutorial.steps.waitIntro.body',
    ctaKey: 'tutorial.steps.waitIntro.cta',
    params: { seconds: TUTORIAL_GOAL_SECONDS },
  },
  {
    id: 'waiting',
    kind: 'waiting',
    titleKey: 'tutorial.steps.waiting.title',
    bodyKey: 'tutorial.steps.waiting.body',
    ctaKey: '',
  },
  {
    id: 'ready',
    kind: 'spotlight',
    spotlight: SPOT_BALANCE,
    titleKey: 'tutorial.steps.ready.title',
    bodyKey: 'tutorial.steps.ready.body',
    ctaKey: 'tutorial.steps.ready.cta',
  },
  {
    id: 'success',
    kind: 'success',
    titleKey: 'tutorial.steps.success.title',
    bodyKey: 'tutorial.steps.success.body',
    ctaKey: 'tutorial.steps.success.cta',
  },
];
