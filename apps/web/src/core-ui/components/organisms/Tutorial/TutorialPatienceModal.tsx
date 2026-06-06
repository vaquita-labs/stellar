'use client';

import { FiAlertTriangle } from 'react-icons/fi';
import { Button } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';
import { formatTutorialMoney, TUTORIAL_PATIENCE } from './tutorialConfig';

interface TutorialPatienceModalProps {
  /** Monto depositado (para el aviso de cuánto se perdería). */
  amount: number;
  /** Interés simulado que se perdería al retirar antes de tiempo. */
  interest: number;
  /** "Got it": solo cierra el aviso (el usuario toca Cancel manualmente). */
  onAck: () => void;
}

/**
 * Aviso "Patience pays off" que se muestra como modal anidado POR ENCIMA de la
 * pantalla de confirmación de retiro anticipado del tutorial. Se usa AppModal
 * (no un div propio) para que el botón funcione sobre el modal del banco y para
 * posicionarlo arriba. No es descartable: solo "Got it" lo cierra; luego el
 * usuario toca Cancel manualmente.
 */
export function TutorialPatienceModal({ amount, interest, onAck }: TutorialPatienceModalProps) {
  return (
    <AppModal
      open
      onOpenChange={onAck}
      isDismissable={false}
      hideClose
      placement="top"
      size="sm"
      title={TUTORIAL_PATIENCE.title}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={
        <Button type="primary" wFull onPress={onAck}>
          {TUTORIAL_PATIENCE.cta}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-black/70">{TUTORIAL_PATIENCE.body}</p>
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
        <FiAlertTriangle className="shrink-0" size={18} />
        <span>
          Keep {formatTutorialMoney(amount)}, lose {formatTutorialMoney(interest)} interest.
        </span>
      </div>
    </AppModal>
  );
}
