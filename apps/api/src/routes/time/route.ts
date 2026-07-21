import { Router } from 'express';
import { env, sendSuccess } from '@vaquita/shared';

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
 */
router.get('/', (req, res) => {
  req.log.info('GET /time (game clock)');
  return sendSuccess(
    res,
    {
      serverTimeMs: Date.now(),
      dayLengthSeconds: env.GAME_DAY_LENGTH_SECONDS,
      // Ancla del ciclo: epoch Unix (0) → progreso continuo y determinista.
      anchorMs: 0,
    },
    'game clock',
  );
});

export default router;
