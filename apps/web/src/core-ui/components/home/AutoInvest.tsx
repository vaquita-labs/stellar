'use client';

import { useEffect, useRef, useState } from 'react';
import { useIdleFunds } from '../../hooks/useAutoInvest';
import { useModalQueueStore, usePendingCreditStore } from '../../stores';
import { useModalPresence } from '../molecules/AppModal';
import { IdleFundsModal } from './IdleFundsModal';

/**
 * Orquestador (sin UI propia) del gate de plata ociosa. Corre `useIdleFunds` en
 * el home: cuando detecta USDC ocioso en una wallet custodial, abre la pantalla
 * completa `IdleFundsModal` para que el usuario lo invierta. Al invertir, el
 * ocioso cae a 0 y la pantalla se cierra sola.
 */
export function AutoInvest() {
  const { idle, shouldPrompt, decided, invest, isInvesting, error, clearError } = useIdleFunds();
  const [open, setOpen] = useState(false);
  // Si el usuario cerró (o la inversión falló y cerró), no volvemos a abrir hasta
  // que entre plata NUEVA (idle sube) — así no lo atrapamos en loop ni lo forzamos.
  const [dismissed, setDismissed] = useState(false);
  const prevIdle = useRef(0);

  // Que el saldo ocioso suba es LA señal de que la plata en vuelo aterrizó, así
  // que acá también se apaga el parpadeo del header. No alcanza con apagarlo al
  // abrir esta pantalla: una compra chica (por debajo del mínimo para invertir)
  // acredita igual y nunca abre nada, y el saldo quedaba parpadeando hasta el
  // vencimiento de 15 minutos aunque la plata ya estuviera a la vista.
  const clearPendingCredit = usePendingCreditStore((s) => s.clearPendingCredit);

  // Mientras esta pantalla todavía PUEDA aparecer, las notas de versión esperan
  // su turno: son dos modales de pantalla completa y decidir sobre la plata va
  // primero. Al desmontarse (salir del home) se libera, así nada queda trabado
  // si el saldo nunca resuelve.
  const setVaultPromptSettled = useModalQueueStore((s) => s.setVaultPromptSettled);
  useEffect(() => {
    setVaultPromptSettled(false);
    return () => setVaultPromptSettled(true);
  }, [setVaultPromptSettled]);

  // El turno se libera cuando el usuario cerró la pantalla (`dismissed`, que
  // también cubre el caso de invertir y cerrarla) o cuando ya se sabe que no
  // hay nada que ofrecer.
  useEffect(() => {
    if (!open && (dismissed || (decided && !shouldPrompt))) setVaultPromptSettled(true);
  }, [open, dismissed, decided, shouldPrompt, setVaultPromptSettled]);

  useEffect(() => {
    if (idle > prevIdle.current + 0.01) {
      setDismissed(false);
      clearPendingCredit();
    }
    prevIdle.current = idle;
  }, [idle, clearPendingCredit]);

  useEffect(() => {
    if (shouldPrompt && !dismissed) setOpen(true);
    else if (!shouldPrompt) setOpen(false);
  }, [shouldPrompt, dismissed]);

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
