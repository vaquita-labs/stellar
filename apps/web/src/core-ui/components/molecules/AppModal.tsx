'use client';

import { Modal } from '@heroui/react';
import Image from 'next/image';
import { ReactNode, useEffect, useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

export type AppModalSize = 'sm' | 'md' | 'lg';

export interface AppModalProps {
  open: boolean;
  onOpenChange: () => void;
  title: ReactNode;
  titleIcon?: string;
  titleIconAlt?: string;
  size?: AppModalSize;
  children: ReactNode;
  footer?: ReactNode;
  isDismissable?: boolean;
  /** Oculta la X de cerrar (ej. tutorial: el modal solo se cierra por su acción). */
  hideClose?: boolean;
  /**
   * Si se define, muestra una flecha "atrás" a la izquierda del título. Sirve
   * para navegar dentro del mismo modal (lista → detalle) sin abrir otro.
   */
  onBack?: () => void;
  /** Posición vertical del modal. Por defecto el comportamiento de HeroUI. */
  placement?: 'auto' | 'top' | 'center' | 'bottom';
  bodyClassName?: string;
  dialogClassName?: string;
}

const SCROLLBAR_CLASSES =
  '[scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.3)_transparent] ' +
  '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:bg-black/30 [&::-webkit-scrollbar-thumb]:rounded-full';

/**
 * Animación tipo "bottom sheet" compartida por todos los modales: el container
 * entra deslizándose desde abajo y sale hacia abajo por el mismo recorrido,
 * mientras el backdrop solo hace fade. Son utilidades de tw-animate-css, que ya
 * viene incluido por @heroui/styles (no hay dependencia nueva).
 *
 * La animación de HeroUI vive en el backdrop y en el container (el dialog no
 * anima). La duración debe coincidir en AMBOS o el que termine antes
 * "reaparece" (fill-mode none) mientras el otro sigue animando → parpadeo.
 * fill-mode-forwards congela el último frame hasta que React Aria desmonta.
 * zoom/fade en 100 anulan el zoom+fade default de HeroUI: slide puro, el sheet
 * se mantiene opaco mientras se mueve.
 *
 * Exportadas para reutilizarlas en otros overlays (drawers, popovers a futuro).
 */
/** Debe coincidir con el duration-250 de las clases de salida de abajo. */
export const MODAL_EXIT_MS = 250;

export const SHEET_BACKDROP_ANIMATION =
  'data-[entering=true]:duration-300 ' +
  // Salida: el container es hijo del backdrop, así que un fade-out normal
  // (opacity del elemento) desvanecería el sheet mientras baja. En su lugar
  // se reemplaza la animación por modal-backdrop-out (globals.css), que solo
  // atenúa el background-color y deja a los hijos 100% opacos.
  'data-[exiting=true]:animate-[modal-backdrop-out_250ms_ease-out_forwards]';
export const SHEET_CONTAINER_ANIMATION =
  'data-[entering=true]:duration-300 data-[entering=true]:ease-out ' +
  'data-[entering=true]:slide-in-from-bottom-full data-[entering=true]:zoom-in-100 data-[entering=true]:fade-in-100 ' +
  'data-[exiting=true]:duration-250 data-[exiting=true]:ease-in ' +
  'data-[exiting=true]:slide-out-to-bottom-full data-[exiting=true]:zoom-out-100 data-[exiting=true]:fade-out-100 ' +
  'data-[exiting=true]:fill-mode-forwards';

/**
 * Mantiene montado un modal montado condicionalmente hasta que termina la
 * animación de salida. Sin esto, `{show && <XxxModal/>}` desmonta de golpe y
 * el modal desaparece sin deslizarse. Uso:
 *   const mounted = useModalPresence(show);
 *   {mounted && <XxxModal open={show} ... />}
 * Se usa este patrón (y no montar siempre) cuando el modal hace fetch al
 * montarse y no queremos dispararlo hasta que el usuario lo abra.
 */
export function useModalPresence(open: boolean, exitMs: number = MODAL_EXIT_MS): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    // Margen extra para que React Aria termine de desmontar sin cortar el último frame.
    const id = setTimeout(() => setMounted(false), exitMs + 50);
    return () => clearTimeout(id);
  }, [open, exitMs]);
  return mounted;
}

export function AppModal({
  open,
  onOpenChange,
  title,
  titleIcon,
  titleIconAlt = '',
  size = 'md',
  children,
  footer,
  isDismissable = true,
  hideClose = false,
  onBack,
  placement,
  bodyClassName,
  dialogClassName,
}: AppModalProps) {
  const { t } = useTranslation();
  return (
    <Modal.Backdrop
      isOpen={open}
      isDismissable={isDismissable}
      onOpenChange={(o) => { if (!o) onOpenChange(); }}
      className={SHEET_BACKDROP_ANIMATION}
    >
      <Modal.Container
        size={size}
        scroll="inside"
        placement={placement}
        className={'px-0! py-3! sm:p-10! ' + SHEET_CONTAINER_ANIMATION}
      >
        <Modal.Dialog
          className={
            'bg-background border border-black ' +
            'max-h-[85dvh] sm:max-h-[90vh] ' +
            'rounded-2xl p-0! ' +
            (dialogClassName ?? '')
          }
        >
          <Modal.Header className="flex-row! items-center gap-3 px-5 sm:px-6 pt-4 pb-3 border-b border-black/10">
            {onBack ? (
              <button
                type="button"
                aria-label={t('common.back')}
                onClick={onBack}
                className="flex items-center justify-center w-7 h-7 -ml-1 rounded-full border border-black border-b-2 bg-white text-black hover:bg-default-100 active:translate-y-0.5 transition-all shrink-0"
              >
                <FiArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            {titleIcon ? (
              <Image src={titleIcon} alt={titleIconAlt} width={22} height={22} />
            ) : null}
            <Modal.Heading className="text-black font-bold text-base flex-1 min-w-0 truncate">
              {title}
            </Modal.Heading>
            {!hideClose && (
              <Modal.CloseTrigger
                aria-label={t('common.close')}
                className='bg-primary text-black text-sm border-[0.5] border-black'
              >
              </Modal.CloseTrigger>
            )}
          </Modal.Header>
          <Modal.Body
            className={
              'px-5 sm:px-6 py-4 overflow-y-auto mt-0! ' + SCROLLBAR_CLASSES + ' ' + (bodyClassName ?? '')
            }
          >
            {children}
          </Modal.Body>
          {footer ? (
            <Modal.Footer className="px-5 sm:px-6 pt-3 pb-5 border-t border-black/10 mt-0!">
              {footer}
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
