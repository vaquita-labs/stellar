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
  title: string;
  body: string;
  /** Texto del botón principal de la tarjeta. */
  cta: string;
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

/** Formato de moneda compartido por las tarjetas del tutorial. */
export const formatTutorialMoney = (n: number) =>
  `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${TUTORIAL_CURRENCY}`;

const SPOT_SAVE = `[data-tutorial="${TUTORIAL_ANCHOR_SAVE}"]`;
const SPOT_BALANCE = `[data-tutorial="${TUTORIAL_ANCHOR_BALANCE}"]`;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    kind: 'message',
    title: 'Meet your vaquita 🐮',
    body: 'You grow it by saving. Quick demo — no real money.',
    cta: "Let's go",
  },
  {
    id: 'deposit',
    kind: 'deposit',
    spotlight: SPOT_SAVE,
    title: 'Make a deposit',
    body: 'Tap the green Save button and confirm any amount.',
    cta: 'Tap Save',
  },

  {
    id: 'find-deposit',
    kind: 'spotlight',
    spotlight: SPOT_BALANCE,
    title: 'Find your savings',
    body: 'Tap your balance up top, then tap your vaquita.',
    cta: 'Open savings',
  },
  {
    id: 'patience',
    kind: 'warn',
    title: 'Patience pays off',
    body: 'Withdraw too early and you lose the interest. Wait for the timer.',
    cta: 'Got it',
  },
  {
    id: 'wait-intro',
    kind: 'message',
    title: 'But if you wait…',
    body: `Save for the ${TUTORIAL_GOAL_SECONDS} seconds you chose and you keep the full interest. Let's watch your vaquita.`,
    cta: `Wait ${TUTORIAL_GOAL_SECONDS}s`,
  },
  {
    id: 'waiting',
    kind: 'waiting',
    title: 'Saving…',
    body: 'Watch your vaquita while it saves.',
    cta: '',
  },
  {
    id: 'ready',
    kind: 'spotlight',
    spotlight: SPOT_BALANCE,
    title: "Time's up! 🎉",
    body: 'Open your savings again and withdraw with interest.',
    cta: 'Withdraw now',
  },
  {
    id: 'success',
    kind: 'success',
    title: 'Nicely done! 🎉',
    body: 'You got your deposit back plus interest.',
    cta: 'Enter app',
  },
];
