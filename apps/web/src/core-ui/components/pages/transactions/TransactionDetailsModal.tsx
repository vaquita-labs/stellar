'use client';

import { AppModal, useModalPresence } from '@/core-ui/components/molecules/AppModal';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TransactionDetailsPage } from './TransactionDetailsPage';

/**
 * Detalle de un movimiento a pantalla completa, como pantalla apilada: entra de
 * derecha a izquierda y sale por donde vino.
 *
 * Es un modal independiente, no vive dentro de ningún otro: se puede abrir desde
 * el modal de movimientos recientes (que queda abierto debajo), desde la lista o
 * desde donde haga falta, pasándole solo el id.
 */
export function TransactionDetailsModal({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Se monta solo cuando hay algo que mostrar (así no dispara su query antes de
  // tiempo), pero sobrevive a la animación de salida para no cortarla.
  const mounted = useModalPresence(transactionId !== null);
  // Durante la salida ya no hay id en el padre: se sigue pintando el último.
  const [lastId, setLastId] = useState(transactionId);
  useEffect(() => {
    if (transactionId) setLastId(transactionId);
  }, [transactionId]);

  const id = transactionId ?? lastId;

  // La URL acompaña a lo que se ve: mientras el detalle está abierto el navegador
  // muestra /transactions?tx=…, así el link es compartible y el "atrás" del
  // sistema cierra el detalle en vez de saltar de pantalla. Es un pushState
  // superficial (soportado por el App Router): no navega ni desmonta el home.
  // Por ref: `onClose` suele venir como función inline, y si entrara en las
  // dependencias el efecto se rearmaría en cada render, deshaciendo la entrada
  // del historial (y cerrando el modal) sin que nadie tocara nada.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!transactionId) return;
    const previousUrl = window.location.pathname + window.location.search;
    window.history.pushState(null, '', `/transactions?tx=${transactionId}`);
    const onPopState = () => onCloseRef.current();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Si se cerró con la flecha (no con el atrás del navegador), se deshace la
      // entrada que agregamos para no dejar la URL del detalle en el historial.
      if (window.location.pathname + window.location.search !== previousUrl) window.history.back();
    };
  }, [transactionId]);

  if (!mounted || !id) return null;

  return (
    <AppModal
      open={transactionId !== null}
      onOpenChange={onClose}
      // Sin barra propia: adentro va la MISMA pantalla que en /transactions, con
      // su PageHeader. Si no, quedaban dos encabezados (y la línea divisoria del
      // modal, que la pantalla no tiene).
      hideHeader
      title={t('transactions.details.title', 'Transaction details')}
      size="lg"
      fullScreen
      slideFrom="right"
      bodyClassName="p-0! flex-1 min-h-0 overflow-hidden"
    >
      <TransactionDetailsPage transactionId={id} onBack={onClose} />
    </AppModal>
  );
}
