import { create } from 'zustand';

/**
 * Reloj de JUEGO acelerado y global. La hora que se muestra en el mapa NO es la
 * local del dispositivo: un día completo dura `DEFAULT_DAY_LENGTH_MS` reales
 * (estilo Minecraft) y es el mismo para todos los jugadores porque se deriva del
 * tiempo ABSOLUTO, corregido con la hora del servidor.
 *
 * El progreso del día es determinista:
 *   progress = ((now - anchor) mod dayLength) / dayLength   ∈ [0, 1)
 * con 0 = medianoche y 0.5 = mediodía.
 *
 * `synced` arranca en false y pasa a true cuando el servidor confirma la hora
 * (GET /api/v1/time). El home NO renderiza el mapa ni el reloj hasta entonces
 * (ver HomePage): como la hora es estado del que depende toda la escena, se
 * espera a conocerla en vez de mostrar una hora provisional que después cambie.
 * Es un store zustand para poder gatear el render de forma reactiva.
 */

/** 20 min reales = 1 día de juego (igual que Minecraft). Es sólo el default de
 *  arranque: el valor real lo define el servidor (columna game_day_length_seconds
 *  del singleton `config`, editable desde el admin) y gana al sincronizar. */
const DEFAULT_DAY_LENGTH_MS = 20 * 60 * 1000;
/** Epoch Unix: hace el progreso continuo y determinista entre clientes. */
const DEFAULT_ANCHOR_MS = 0;

type GameClockState = {
  /** serverTime - clientTime al momento de sincronizar (corrige desfase local). */
  offsetMs: number;
  dayLengthMs: number;
  anchorMs: number;
  synced: boolean;
  sync: (params: { serverTimeMs: number; dayLengthSeconds?: number; anchorMs?: number }) => void;
};

export const useGameClockStore = create<GameClockState>((set) => ({
  offsetMs: 0,
  dayLengthMs: DEFAULT_DAY_LENGTH_MS,
  anchorMs: DEFAULT_ANCHOR_MS,
  synced: false,
  sync: (params) =>
    set((state) => ({
      offsetMs: params.serverTimeMs - Date.now(),
      dayLengthMs:
        params.dayLengthSeconds && params.dayLengthSeconds > 0
          ? params.dayLengthSeconds * 1000
          : state.dayLengthMs,
      anchorMs: typeof params.anchorMs === 'number' ? params.anchorMs : state.anchorMs,
      synced: true,
    })),
}));

/** Alinea el reloj de juego con la respuesta del servidor (GET /api/v1/time). */
export function syncGameClock(params: {
  serverTimeMs: number;
  dayLengthSeconds?: number;
  anchorMs?: number;
}): void {
  useGameClockStore.getState().sync(params);
}

/** True una vez que el reloj se alineó con el servidor. Versión imperativa. */
export const isGameClockSynced = (): boolean => useGameClockStore.getState().synced;

/** Hook reactivo: re-renderiza cuando el reloj pasa a sincronizado. */
export const useGameClockSynced = (): boolean => useGameClockStore((s) => s.synced);

const correctedNow = () => Date.now() + useGameClockStore.getState().offsetMs;

/** Progreso del día de juego en [0, 1): 0 = medianoche, 0.5 = mediodía. */
export function getGameDayProgress(): number {
  const { dayLengthMs, anchorMs } = useGameClockStore.getState();
  const elapsed = correctedNow() - anchorMs;
  const intoDay = ((elapsed % dayLengthMs) + dayLengthMs) % dayLengthMs;
  return intoDay / dayLengthMs;
}

/**
 * Hora de juego SÓLO en horas, formato 12h con am/pm (sin minutos): "12 am",
 * "2 am", "12 pm", "8 pm". Derivada del progreso del día.
 */
export function getGameHourLabel(): string {
  const hour24 = Math.floor(getGameDayProgress() * 24) % 24;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 || 12;
  return `${hour12} ${suffix}`;
}
