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
}: {
  transactionId: string | null;
  onClose: () => void;
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
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.28 }}
          className="absolute inset-0 z-40 bg-background"
        >
          <TransactionDetailsPage transactionId={lastId ?? transactionId} onBack={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
