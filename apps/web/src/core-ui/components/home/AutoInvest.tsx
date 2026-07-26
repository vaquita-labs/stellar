'use client';

import { useEffect, useRef, useState } from 'react';
import { useIdleFunds } from '../../hooks/useAutoInvest';
import { useModalPresence } from '../molecules/AppModal';
import { IdleFundsModal } from './IdleFundsModal';

/**
 * Orquestador (sin UI propia) del gate de plata ociosa. Corre `useIdleFunds` en
 * el home: cuando detecta USDC ocioso en una wallet custodial, abre la pantalla
 * completa `IdleFundsModal` para que el usuario lo invierta. Al invertir, el
 * ocioso cae a 0 y la pantalla se cierra sola.
 */
export function AutoInvest() {
  const { idle, shouldPrompt, invest, isInvesting, error, clearError } = useIdleFunds();
  const [open, setOpen] = useState(false);
  // Si el usuario cerró (o la inversión falló y cerró), no volvemos a abrir hasta
  // que entre plata NUEVA (idle sube) — así no lo atrapamos en loop ni lo forzamos.
  const [dismissed, setDismissed] = useState(false);
  const prevIdle = useRef(0);

  useEffect(() => {
    if (idle > prevIdle.current + 0.01) setDismissed(false);
    prevIdle.current = idle;
  }, [idle]);

  useEffect(() => {
    if (shouldPrompt && !dismissed) setOpen(true);
    else if (!shouldPrompt) setOpen(false);
  }, [shouldPrompt, dismissed]);

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
