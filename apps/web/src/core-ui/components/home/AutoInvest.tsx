'use client';

import { useEffect, useRef, useState } from 'react';
import { MIN_IDLE_USDC } from '../../helpers/numbers';
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
  // Se invirtió y el saldo todavía no lo refleja. La lectura de la wallet va por
  // detrás de la transacción, así que durante unos segundos vuelve el monto de
  // antes: eso NO es plata nueva, es el saldo que no se enteró, y tomarlo por
  // tal reabría la pantalla sola un rato después de invertir.
  const settlingInvest = useRef(false);

  // Que el saldo ocioso suba es LA señal de que el dinero en vuelo aterrizó, así
  // que acá también se apaga el parpadeo del header. No alcanza con apagarlo al
  // abrir esta pantalla: una compra chica (por debajo del mínimo para invertir)
  // acredita igual y nunca abre nada, y el saldo quedaba parpadeando hasta el
  // vencimiento de 15 minutos aunque el dinero ya estuviera a la vista.
  const clearPendingCredit = usePendingCreditStore((s) => s.clearPendingCredit);

  // The place in the queue is given back once the user has closed the screen
  // (`dismissed`, which also covers investing and closing it) or once we know
  // there is nothing to offer. `HomePage` reserves it on entry, because this
  // component only mounts after the clock syncs and by then the version note
  // would already have been shown.
  //
  // `ourTurn` is everything ahead of it being out of the way: the notification
  // ask, the tour and the welcome gift. The order is in [[auto-modals]].
  const settled = !open && (dismissed || (decided && !shouldPrompt));
  const ourTurn = useAutoModalSlot('vault-prompt', settled);

  useEffect(() => {
    // Recién cuando el saldo baja del piso sabemos que la inversión ya está
    // reflejada; desde ahí una subida vuelve a significar plata nueva.
    if (settlingInvest.current) {
      if (idle < MIN_IDLE_USDC) settlingInvest.current = false;
    } else if (idle > prevIdle.current + 0.01) {
      setDismissed(false);
      clearPendingCredit();
    }
    prevIdle.current = idle;
  }, [idle, clearPendingCredit]);

  // This screen is a full-screen interruption, so it may not land on top of what
  // the user is already doing. That rule also settles the serious case: every
  // flow that parks money in the wallet mid-way — the two-hop withdrawal, a
  // locked position moving to the vault, the migration — runs behind a sheet
  // that CANNOT be closed while its transaction is in flight
  // (`isDismissable={false}` plus `hideClose`, the rule in every money sheet).
  // So "nothing on screen" also means "no transaction in flight", and asking the
  // screen covers the flows written after this line too.
  //
  // Without the guard the prompt opened over the second leg of a withdrawal,
  // offering to invest the money that was only passing through; accepting it
  // sent that money back to the vault and the payment bounced underfunded,
  // leaving the withdrawal half done.
  const waitingToOpen = shouldPrompt && !dismissed && ourTurn && !open;
  // Asked only in order to OPEN. Asked while it is open it would see its own
  // dialog and close itself on the next tick.
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
      // El usuario ya decidió sobre ESTA plata. Sin esto la pantalla se reabría
      // sola al instante: `shouldPrompt` sigue en true hasta que el refresco del
      // saldo aterriza, y el efecto de abajo la vuelve a abrir en cuanto el
      // diálogo sale del DOM. Vuelve a ofrecerse cuando entre plata nueva.
      setDismissed(true);
      settlingInvest.current = true;
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
