'use client';

import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <AppModal
      open
      onOpenChange={onAck}
      isDismissable={false}
      hideClose
      placement="top"
      size="sm"
      title={t(TUTORIAL_PATIENCE.titleKey)}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={
        <Button type="primary" wFull onPress={onAck}>
          {t(TUTORIAL_PATIENCE.ctaKey)}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-black/70">{t(TUTORIAL_PATIENCE.bodyKey)}</p>
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
        <FiAlertTriangle className="shrink-0" size={18} />
        <span>
          {t('tutorial.warn.keepLose', {
            defaultValue: 'Keep {{amount}}, lose {{interest}} interest.',
            amount: formatTutorialMoney(amount),
            interest: formatTutorialMoney(interest),
          })}
        </span>
      </div>
    </AppModal>
  );
}
