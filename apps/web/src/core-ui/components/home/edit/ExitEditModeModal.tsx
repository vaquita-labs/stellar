import { Button } from '@/core-ui/components';
import { PressEvent } from '@react-types/shared';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';

interface ExitEditModeModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  handleDiscard: (e: PressEvent) => void;
  handleConfirmExit: (e: PressEvent) => void;
  /** Guardado en curso: botones bloqueados y spinner en "Guardar y salir". */
  isSaving?: boolean;
}

export const ExitEditModeModal = ({
  isOpen,
  onOpenChange,
  handleDiscard,
  handleConfirmExit,
  isSaving = false,
}: ExitEditModeModalProps) => {
  const { t } = useTranslation();
  return (
    <AppModal
      open={isOpen}
      onOpenChange={() => {
        // No permitir cerrar el modal mientras se está guardando.
        if (isSaving) return;
        onOpenChange(false);
      }}
      title={t('home.exitEdit.title', 'Exit edit mode?')}
      size="sm"
      isDismissable={!isSaving}
      footer={
        <div className="flex flex-col-reverse gap-2 w-full [&>*]:w-full">
          <Button onPress={handleDiscard} type="white" isDisabled={isSaving}>
            {t('home.exitEdit.discard', 'Discard changes')}
          </Button>
          <Button onPress={handleConfirmExit} isLoading={isSaving} aria-label={t('home.exitEdit.saveAndExit', 'Save and exit')}>
            {t('home.exitEdit.saveAndExit', 'Save and exit')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-yellow-600 dark:text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-gray-600 dark:text-gray-400 text-center text-sm">
          {t('home.exitEdit.body', 'You have unsaved changes. Are you sure you want to exit edit mode?')}
        </p>
      </div>
    </AppModal>
  );
};
