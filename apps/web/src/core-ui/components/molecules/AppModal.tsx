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
   * Oculta la barra de título completa (back, título y X). Para hojas que ponen
   * su propio encabezado dentro del body (ej. el selector de fecha, que se
   * cierra con sus botones). El título sigue existiendo para lectores de
   * pantalla.
   */
  hideHeader?: boolean;
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
  /**
   * Capa que se pinta por encima del contenido, dentro del propio diálogo (no
   * es otro overlay de React Aria). Para selectores que deben aparecer sobre el
   * formulario sin desmontarlo ni taparlo por completo, como el de fecha en los
   * filtros del historial.
   */
  overlay?: ReactNode;
}

/**
 * En mobile el modal es un bottom-sheet a todo el ancho, así que se anula el
 * max-width que trae el `size` de HeroUI y se restaura recién en sm. Sin esto,
 * los tamaños más chicos (sm = 384px) quedan angostos y con huecos a los lados
 * contra el borde inferior de la pantalla.
 */
const SIZE_MAX_WIDTH: Record<AppModalSize, string> = {
  sm: 'max-w-none! sm:max-w-sm!',
  md: 'max-w-none! sm:max-w-md!',
  lg: 'max-w-none! sm:max-w-lg!',
};

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
  hideHeader = false,
  onBack,
  placement,
  fullScreen = false,
  bodyClassName,
  dialogClassName,
  overlay,
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
          // En mobile es un bottom-sheet: pegado al borde inferior (justify-end,
          // sin padding abajo) para que no quede un hueco. En desktop vuelve a
          // ser una tarjeta centrada con márgenes.
          // OJO: el container de HeroUI es `flex flex-col`, así que el eje
          // principal es el vertical (justify-*) y align-items controla el
          // HORIZONTAL. Usar items-end aquí pegaba el diálogo al borde derecho
          // (se notaba con size="sm", que no ocupa todo el ancho).
          (fullScreen
            ? 'p-0! '
            : 'justify-end! items-center! px-0! pt-3! pb-0! sm:justify-center! sm:p-10! ') +
          SHEET_CONTAINER_ANIMATION
        }
      >
        <Modal.Dialog
          className={
            // relative + overflow-hidden: anclan la capa `overlay` al diálogo y
            // la recortan a sus esquinas.
            'bg-background relative overflow-hidden ' +
            (fullScreen
              ? 'h-dvh max-h-dvh w-full max-w-none rounded-none border-0 '
              : // Bottom-sheet en mobile: solo esquinas superiores redondeadas y
                // sin borde inferior, porque el modal termina contra el borde de
                // la pantalla. En desktop (sm) se restauran las 4 esquinas y el
                // borde completo de la tarjeta flotante.
                'border border-black border-b-0 rounded-2xl rounded-b-none max-h-[85dvh] ' +
                'sm:border-b sm:rounded-b-2xl sm:max-h-[90vh] ' +
                SIZE_MAX_WIDTH[size] +
                ' ') +
            'p-0! ' +
            (dialogClassName ?? '')
          }
        >
          {/* Con hideHeader la barra sigue en el árbol pero fuera de pantalla
              (sr-only): así el diálogo conserva su nombre accesible sin ocupar
              layout ni pintar el borde inferior. */}
          <Modal.Header
            className={
              hideHeader
                ? 'sr-only'
                : 'flex-row! items-center gap-2 px-4 sm:px-5 pt-3.5 pb-3 border-b border-black/10'
            }
          >
            {/* Los dos costados son contenedores del MISMO ancho (uno con el
                back, otro con la X), así el título —flex-1 centrado en medio—
                queda centrado respecto al modal y no respecto al espacio que
                sobra, sin importar qué controles haya a los lados. */}
            <div className="w-7 shrink-0 flex items-center justify-start">
              {onBack && !hideHeader ? (
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
            <div className="w-7 shrink-0 flex items-center justify-end">
              {!hideClose && !hideHeader && (
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
              // mx-0!: HeroUI le da al body `margin:-3px; padding:3px` (para que
              // el focus-ring no se recorte con el overflow). Nuestro px-* pisa
              // ese padding pero el margen negativo queda y el body sobresale
              // 3px por lado respecto del header/footer.
              'px-4 sm:px-5 py-4 overflow-y-auto mt-0! mx-0! ' +
              SCROLLBAR_CLASSES +
              ' ' +
              (bodyClassName ?? '')
            }
          >
            {children}
          </Modal.Body>
          {footer ? (
            <Modal.Footer className="px-4 sm:px-5 pt-3 pb-5 border-t border-black/10 mt-0!">
              {footer}
            </Modal.Footer>
          ) : null}
          {overlay}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
