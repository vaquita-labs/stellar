import { Router } from 'express';
import { getGameDayLengthSeconds, sendError, sendSuccess } from '@vaquita/shared';

const router = Router();

/**
 * Reloj de juego global. Devuelve la hora ACTUAL del servidor y los parámetros
 * del ciclo día/noche para que todos los clientes calculen el mismo progreso,
 * sin depender de la hora local (que varía por dispositivo y zona horaria).
 *
 * El progreso del día se deriva de forma determinista del tiempo absoluto:
 *   progress = ((serverTimeMs - anchorMs) mod dayLengthMs) / dayLengthMs
 * Como `anchorMs`, `dayLengthSeconds` y el tiempo del servidor son iguales para
 * todos, el día de juego está sincronizado en todos lados. El cliente sólo usa
 * `serverTimeMs` para corregir el desfase de su reloj local y luego avanza solo.
 *
 * `dayLengthSeconds` se lee EN VIVO del singleton `config` en la base de datos
 * (columna game_day_length_seconds), así se puede cambiar sin redeploy y aplica
 * a todos por igual.
 */
router.get('/', async (req, res) => {
  req.log.info('GET /time (game clock)');
  try {
    const dayLengthSeconds = await getGameDayLengthSeconds();
    return sendSuccess(
      res,
      {
        serverTimeMs: Date.now(),
        dayLengthSeconds,
        // Ancla del ciclo: epoch Unix (0) → progreso continuo y determinista.
        anchorMs: 0,
      },
      'game clock',
    );
  } catch (err: any) {
    req.log.error({ err }, 'Failed to read game clock config');
    return sendError(res, err?.message ?? 'Failed to read game clock config', err, 500);
  }
});

export default router;
