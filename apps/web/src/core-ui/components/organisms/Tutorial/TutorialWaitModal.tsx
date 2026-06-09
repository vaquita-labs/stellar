'use client';

import { useTranslation } from 'react-i18next';
import { FiClock } from 'react-icons/fi';
import { Button } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';
import { TUTORIAL_WAIT_NOTICE } from './tutorialConfig';

interface TutorialWaitModalProps {
  /** Cierra el aviso y arranca la cuenta regresiva del detalle. */
  onConfirm: () => void;
}

/**
 * Aviso "But if you wait…" que aparece TRAS cancelar el retiro anticipado y
 * ANTES de que arranque el contador: invita a esperar el tiempo objetivo para
 * conservar todo el interés. Reutiliza AppModal para montarse sobre el detalle.
 */
export function TutorialWaitModal({ onConfirm }: TutorialWaitModalProps) {
  const { t } = useTranslation();
  return (
    <AppModal
      open
      onOpenChange={onConfirm}
      isDismissable={false}
      hideClose
      placement="top"
      size="sm"
      title={t(TUTORIAL_WAIT_NOTICE.titleKey, 'But if you wait…')}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={
        <Button type="primary" wFull onPress={onConfirm}>
          {t(TUTORIAL_WAIT_NOTICE.ctaKey, 'Wait {{seconds}}s', TUTORIAL_WAIT_NOTICE.params)}
        </Button>
      }
    >
      <div className="flex items-start gap-2">
        <FiClock className="mt-0.5 shrink-0 text-primary" size={18} />
        <p className="text-sm leading-relaxed text-black/70">
          {t(TUTORIAL_WAIT_NOTICE.bodyKey, TUTORIAL_WAIT_NOTICE.params)}
        </p>
      </div>
    </AppModal>
  );
}
