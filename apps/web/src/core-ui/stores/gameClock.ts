/**
 * Reloj de JUEGO acelerado y global. La hora que se muestra en el mapa NO es la
 * local del dispositivo: un día completo dura `DEFAULT_DAY_LENGTH_MS` reales
 * (estilo Minecraft) y es el mismo para todos los jugadores porque se deriva del
 * tiempo ABSOLUTO, corregido con la hora del servidor.
 *
 * El progreso del día es determinista:
 *   progress = ((now - anchor) mod dayLength) / dayLength   ∈ [0, 1)
 * con 0 = medianoche y 0.5 = mediodía. Tanto el reloj flotante (`MapClock`) como
 * el ciclo de luz del mapa (`DayCycleSky`) leen de acá, así que siempre coinciden.
 *
 * Antes de sincronizar con el servidor ya funciona (offset 0 → usa el reloj del
 * dispositivo contra el mismo ancla), así no hay parpadeo; `syncGameClock` sólo
 * corrige el desfase del reloj local para que sea idéntico entre dispositivos.
 */

/** 20 min reales = 1 día de juego (igual que Minecraft). Debe coincidir con el
 *  default del servidor (env GAME_DAY_LENGTH_SECONDS); si difieren, el valor del
 *  servidor gana al sincronizar. */
const DEFAULT_DAY_LENGTH_MS = 20 * 60 * 1000;
/** Epoch Unix: hace el progreso continuo y determinista entre clientes. */
const DEFAULT_ANCHOR_MS = 0;

type GameClock = {
  /** serverTime - clientTime al momento de sincronizar (corrige desfase local). */
  offsetMs: number;
  dayLengthMs: number;
  anchorMs: number;
  synced: boolean;
};

const clock: GameClock = {
  offsetMs: 0,
  dayLengthMs: DEFAULT_DAY_LENGTH_MS,
  anchorMs: DEFAULT_ANCHOR_MS,
  synced: false,
};

/** Alinea el reloj de juego con la respuesta del servidor (GET /api/v1/time). */
export function syncGameClock(params: {
  serverTimeMs: number;
  dayLengthSeconds?: number;
  anchorMs?: number;
}): void {
  clock.offsetMs = params.serverTimeMs - Date.now();
  if (params.dayLengthSeconds && params.dayLengthSeconds > 0) {
    clock.dayLengthMs = params.dayLengthSeconds * 1000;
  }
  if (typeof params.anchorMs === 'number') {
    clock.anchorMs = params.anchorMs;
  }
  clock.synced = true;
}

const correctedNow = () => Date.now() + clock.offsetMs;

/** Progreso del día de juego en [0, 1): 0 = medianoche, 0.5 = mediodía. */
export function getGameDayProgress(): number {
  const elapsed = correctedNow() - clock.anchorMs;
  const intoDay = ((elapsed % clock.dayLengthMs) + clock.dayLengthMs) % clock.dayLengthMs;
  return intoDay / clock.dayLengthMs;
}

/** Hora de juego HH:MM (24h) derivada del progreso del día. */
export function getGameTimeLabel(): string {
  const totalMinutes = Math.floor(getGameDayProgress() * 24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
