'use client';

import { useEffect, useRef, useState } from 'react';
import { useIdleFunds } from '../../hooks/useAutoInvest';
import { useModalOnScreen } from '../../hooks/useModalOnScreen';
import { useAutoModalSlot, usePendingCreditStore } from '../../stores';
import { useModalPresence } from '../molecules/AppModal';
import { IdleFundsModal } from './IdleFundsModal';

/**
 * Orquestador (sin UI propia) del gate de dinero ocioso. Corre `useIdleFunds` en
 * el home: cuando detecta USDC ocioso en una wallet custodial, abre la pantalla
 * completa `IdleFundsModal` para que el usuario lo invierta. Al invertir, el
 * ocioso cae a 0 y la pantalla se cierra sola.
 */
export function AutoInvest() {
  const { idle, shouldPrompt, decided, invest, isInvesting, error, clearError } = useIdleFunds();
  const [open, setOpen] = useState(false);
  // Si el usuario cerró (o la inversión falló y cerró), no volvemos a abrir hasta
  // que entre dinero NUEVO (idle sube) — así no lo atrapamos en loop ni lo forzamos.
  const [dismissed, setDismissed] = useState(false);
  const prevIdle = useRef(0);

  // Que el saldo ocioso suba es LA señal de que el dinero en vuelo aterrizó, así
  // que acá también se apaga el parpadeo del header. No alcanza con apagarlo al
  // abrir esta pantalla: una compra chica (por debajo del mínimo para invertir)
  // acredita igual y nunca abre nada, y el saldo quedaba parpadeando hasta el
  // vencimiento de 15 minutos aunque el dinero ya estuviera a la vista.
  const clearPendingCredit = usePendingCreditStore((s) => s.clearPendingCredit);

  // El lugar en la cola se suelta cuando el usuario cerró la pantalla
  // (`dismissed`, que también cubre el caso de invertir y cerrarla) o cuando ya
  // se sabe que no hay nada que ofrecer. `HomePage` lo reserva al entrar,
  // porque este componente monta recién después de que sincroniza el reloj y
  // para entonces la nota de versión ya se habría mostrado.
  //
  // `ourTurn` es todo lo que va antes ya fuera del camino: el permiso de
  // notificaciones, el tour y el regalo de bienvenida. El orden vive en
  // [[auto-modals]].
  const settled = !open && (dismissed || (decided && !shouldPrompt));
  const ourTurn = useAutoModalSlot('vault-prompt', settled);

  useEffect(() => {
    if (idle > prevIdle.current + 0.01) {
      setDismissed(false);
      clearPendingCredit();
    }
    prevIdle.current = idle;
  }, [idle, clearPendingCredit]);

  // Esta pantalla es una interrupción a pantalla completa, así que no puede
  // caer encima de algo que el usuario ya está haciendo. Y de paso resuelve el
  // problema serio: todo flujo que estaciona plata en la wallet a mitad de
  // camino —el retiro de dos saltos, el de una posición al vault, la migración—
  // corre detrás de un sheet que NO se puede cerrar mientras la transacción
  // está en vuelo (`isDismissable={false}` + `hideClose`, la regla de todos los
  // sheets de plata). O sea que "no hay nada en pantalla" también significa "no
  // hay ninguna transacción en vuelo", y preguntárselo a la pantalla cubre
  // también los flujos que se escriban después de esta línea.
  //
  // Sin esta guarda, el prompt abría sobre el salto 2 de un retiro ofreciendo
  // invertir la plata que estaba justo ahí de paso; aceptarlo la devolvía al
  // vault y el pago rebotaba por saldo, dejando el retiro a medias.
  const waitingToOpen = shouldPrompt && !dismissed && ourTurn && !open;
  // Sólo se consulta para ABRIR. Consultada mientras está abierta vería su
  // propio diálogo y la cerraría en el tick siguiente.
  const modalOnScreen = useModalOnScreen(waitingToOpen);

  useEffect(() => {
    if (shouldPrompt && !dismissed && ourTurn && !modalOnScreen) setOpen(true);
    else if (!shouldPrompt) setOpen(false);
  }, [shouldPrompt, dismissed, ourTurn, modalOnScreen]);

  // Y también al abrir la pantalla, que es el desenlace esperado: para entonces
  // la rampa hace rato que se cerró y no puede apagarlo ella.
  useEffect(() => {
    if (open) clearPendingCredit();
  }, [open, clearPendingCredit]);

  const mounted = useModalPresence(open);

  const handleClose = () => {
    setOpen(false);
    setDismissed(true);
    clearError();
  };

  const handleInvest = async () => {
    try {
      await invest();
      setOpen(false);
    } catch {
      // El error ya quedó en `error` y se muestra en la pantalla; permanece abierta
      // (ahora dismissable) para reintentar o cerrar.
    }
  };

  if (!mounted) return null;

  return (
    <IdleFundsModal
      open={open}
      onOpenChange={handleClose}
      idle={idle}
      onInvest={handleInvest}
      investing={isInvesting}
      error={error}
      // Nudge cerrable: siempre puede cerrar. Al cerrar, la plata queda en su
      // wallet (disponible, sin invertir) — NO la movemos ni la forzamos.
      dismissable
    />
  );
}
