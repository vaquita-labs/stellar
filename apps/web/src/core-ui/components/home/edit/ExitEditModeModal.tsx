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
        // text-xs + px-3: con el tamaño por defecto "Discard changes" salta a
        // dos líneas cuando los dos botones comparten la fila.
        <div className="flex flex-row gap-2 w-full [&>*]:flex-1 [&>*]:min-w-0 [&>*]:text-xs [&>*]:px-3">
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
        {/* Sin círculo de fondo: el triángulo mismo va relleno de amarillo con
            contorno negro, el lenguaje visual del mapa (siluetas con línea
            negra). El signo de admiración se dibuja aparte para que quede en
            negro sobre el relleno. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-16 w-16 text-black"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.1}
        >
          <path
            fill="#FFD34E"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.072 19h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
          <path fill="none" strokeLinecap="round" strokeLinejoin="round" d="M12 9v2.5m0 3.5h.01" />
        </svg>
        <p className="text-black/70 text-center text-sm">
          {t('home.exitEdit.body', 'You have unsaved changes. Are you sure you want to exit edit mode?')}
        </p>
      </div>
    </AppModal>
  );
};
