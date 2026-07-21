'use client';

import { Modal } from '@heroui/react';
import Image from 'next/image';
import { ReactNode, useEffect, useState } from 'react';
import { FiChevronLeft, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { CircleIconButton } from './CircleIconButton';

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
  /**
   * Ocupa toda la pantalla (sin márgenes ni esquinas redondeadas), para
   * contenidos que son una pantalla completa y no una hoja sobre el home.
   * Mantiene la misma animación de entrada/salida desde abajo.
   */
  fullScreen?: boolean;
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
  // El container es hijo del backdrop, así que un fade normal (opacity del
  // elemento) desvanecería también al sheet mientras se desliza. En ambas
  // direcciones se reemplaza la animación por keyframes de globals.css que
  // solo atenúan el background-color y dejan a los hijos 100% opacos.
  'data-[entering=true]:animate-[modal-backdrop-in_300ms_ease-out] ' +
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
  fullScreen = false,
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
        className={
          // En mobile es un bottom-sheet: pegado al borde inferior (items-end,
          // sin padding abajo) para que no quede un hueco. En desktop vuelve a
          // ser una tarjeta centrada con márgenes.
          (fullScreen
            ? 'p-0! '
            : 'items-end! px-0! pt-3! pb-0! sm:items-center! sm:p-10! ') +
          SHEET_CONTAINER_ANIMATION
        }
      >
        <Modal.Dialog
          className={
            'bg-background ' +
            (fullScreen
              ? 'h-dvh max-h-dvh w-full max-w-none rounded-none border-0 '
              : // Bottom-sheet en mobile: solo esquinas superiores redondeadas y
                // sin borde inferior, porque el modal termina contra el borde de
                // la pantalla. En desktop (sm) se restauran las 4 esquinas y el
                // borde completo de la tarjeta flotante.
                'border border-black border-b-0 rounded-2xl rounded-b-none max-h-[85dvh] ' +
                'sm:border-b sm:rounded-b-2xl sm:max-h-[90vh] ') +
            'p-0! ' +
            (dialogClassName ?? '')
          }
        >
          <Modal.Header className="flex-row! items-center gap-2 px-5 sm:px-6 pt-4 pb-3 border-b border-black/10">
            {/* Los dos costados son contenedores del MISMO ancho (uno con el
                back, otro con la X), así el título —flex-1 centrado en medio—
                queda centrado respecto al modal y no respecto al espacio que
                sobra, sin importar qué controles haya a los lados. */}
            <div className="w-9 shrink-0 flex items-center justify-start">
              {onBack ? (
                <CircleIconButton
                  variant="primary"
                  size="sm"
                  ariaLabel={t('common.back')}
                  onClick={onBack}
                  icon={<FiChevronLeft className="w-4 h-4" />}
                />
              ) : null}
            </div>
            <Modal.Heading className="flex-1 min-w-0 flex items-center justify-center gap-2 text-black font-bold text-base text-center">
              {titleIcon ? (
                <Image src={titleIcon} alt={titleIconAlt} width={22} height={22} className="shrink-0" />
              ) : null}
              <span className="truncate">{title}</span>
            </Modal.Heading>
            <div className="w-9 shrink-0 flex items-center justify-end">
              {!hideClose && (
                <CircleIconButton
                  variant="white"
                  size="sm"
                  ariaLabel={t('common.close')}
                  onClick={onOpenChange}
                  icon={<FiX className="w-4 h-4" />}
                />
              )}
            </div>
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
