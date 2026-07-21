'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TransactionDetailsPage } from './TransactionDetailsPage';

/**
 * Detalle de transacción como capa encima de la lista.
 *
 * Lo controla el query param `?tx=` de /transactions, no una ruta propia: así
 * la lista nunca se desmonta (queda debajo, con su scroll) y el panel puede
 * animar entrada y salida. Al cerrar, `onClose` vuelve atrás en el historial;
 * el id se pone en null y esta capa anima su salida antes de desaparecer.
 */
export function TransactionDetailsOverlay({
  transactionId,
  onClose,
  animated = true,
}: {
  transactionId: string | null;
  onClose: () => void;
  /**
   * `false` cuando se llegó directo con `?tx=` (acceso rápido desde el modal de
   * movimientos recientes): el panel se pinta ya puesto, sin deslizarse, para
   * que la lista de atrás nunca llegue a verse.
   */
  animated?: boolean;
}) {
  // Durante la animación de salida ya no hay id en la URL, pero el panel sigue
  // en pantalla: se pinta con el último conocido para que no se vacíe.
  const [lastId, setLastId] = useState(transactionId);
  useEffect(() => {
    if (transactionId) setLastId(transactionId);
  }, [transactionId]);

  return (
    <AnimatePresence>
      {transactionId && (
        <motion.div
          key="transaction-details"
          initial={animated ? { x: '100%' } : false}
          animate={{ x: 0 }}
          exit={animated ? { x: '100%' } : { x: 0 }}
          transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: animated ? 0.28 : 0 }}
          className="absolute inset-0 z-40 bg-background"
        >
          <TransactionDetailsPage transactionId={lastId ?? transactionId} onBack={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
