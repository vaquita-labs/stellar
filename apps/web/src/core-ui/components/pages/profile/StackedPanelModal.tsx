'use client';

import { AppModal, useModalPresence } from '@/core-ui/components/molecules/AppModal';
import { ReactNode, useEffect, useRef } from 'react';

/**
 * Pantalla apilada sobre lo que haya debajo: entra de derecha a izquierda y sale
 * por donde vino, con el fondo quieto y montado. Encapsula el patrón que ya
 * usaban <FriendsModal> y <SettingsModal> — un AppModal a pantalla completa + una
 * entrada de historial superficial (pushState) para que la URL acompañe al panel
 * y el "atrás" del sistema lo cierre en vez de saltar de pantalla.
 *
 * Reutilizable para APILAR sub-paneles (Preferences, Wallet…) sobre otro panel:
 * como nada se desmonta, volver revela lo de atrás sin recargar. Varios apilados
 * conviven porque cada uno sólo reacciona al "atrás" que lo saca de SU propia URL
 * (ver el guard en el popstate), no al que lo devuelve a ella al cerrarse el de
 * encima.
 */
export function StackedPanelModal({
  open,
  onClose,
  url,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Ruta que refleja el panel mientras está abierto (pushState superficial). */
  url: string;
  title?: string;
  children: ReactNode;
}) {
  // Se monta al abrir y sobrevive a la animación de salida para no cortarla.
  const mounted = useModalPresence(open);

  // Por ref: `onClose` suele venir inline; en las dependencias rearmaría el
  // efecto en cada render, deshaciendo la entrada de historial sin que nadie
  // tocara nada.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    window.history.pushState(null, '', url);
    const onPopState = () => {
      // Sólo cerramos si el "atrás" nos sacó de NUESTRA url. Si nos devolvió a
      // ella (se cerró un panel apilado encima y disparó su history.back),
      // seguimos abiertos.
      if (window.location.pathname !== url) onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Al cerrarse en su lugar (flecha atrás), la URL sigue siendo la nuestra:
      // deshacemos el pushState para no dejarla en el historial. Si el usuario
      // avanzó a un panel más profundo, la URL ya cambió y no tocamos nada
      // (deshacerlo cancelaría esa navegación).
      if (window.location.pathname === url) window.history.back();
    };
  }, [open, url]);

  if (!mounted) return null;

  return (
    <AppModal
      open={open}
      onOpenChange={onClose}
      // Sin barra propia: adentro va la MISMA pantalla que en su ruta, con su
      // PageHeader. Si no, quedarían dos encabezados.
      hideHeader
      title={title}
      size="lg"
      fullScreen
      slideFrom="right"
      bodyClassName="p-0! flex-1 min-h-0 overflow-hidden"
    >
      {children}
    </AppModal>
  );
}
