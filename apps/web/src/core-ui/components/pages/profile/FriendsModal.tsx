'use client';

import { AppModal, useModalPresence } from '@/core-ui/components/molecules/AppModal';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FriendsPage } from './FriendsPage';

/**
 * "Buscar amigos" como pantalla apilada sobre el perfil: entra de derecha a
 * izquierda y sale por donde vino, con el perfil quieto debajo.
 *
 * Antes era un push de ruta (/profile/friends): Next desmonta la pantalla
 * anterior, así que el perfil desaparecía de golpe y volver era otro salto.
 * Mismo tratamiento que el detalle de un movimiento sobre la lista
 * (<TransactionDetailsModal>), para que todo lo que se apila se sienta igual.
 */
export function FriendsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // Se monta al abrir y sobrevive a la animación de salida para no cortarla.
  const mounted = useModalPresence(open);

  // La URL acompaña a lo que se ve: mientras el panel está abierto el navegador
  // muestra /profile/friends, así el enlace es compartible y el "atrás" del
  // sistema cierra el panel en vez de saltar de pantalla. Es un pushState
  // superficial: no navega ni desmonta el perfil.
  // Por ref: `onClose` suele venir como función inline, y si entrara en las
  // dependencias el efecto se rearmaría en cada render, deshaciendo la entrada
  // del historial (y cerrando el panel) sin que nadie tocara nada.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previousUrl = window.location.pathname + window.location.search;
    window.history.pushState(null, '', '/profile/friends');
    const onPopState = () => onCloseRef.current();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Si se cerró con la flecha (no con el atrás del navegador), se deshace la
      // entrada que agregamos para no dejar esa URL en el historial.
      if (window.location.pathname + window.location.search !== previousUrl) window.history.back();
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <AppModal
      open={open}
      onOpenChange={onClose}
      // Sin barra propia: adentro va la MISMA pantalla que en /profile/friends,
      // con su PageHeader. Si no, quedarían dos encabezados.
      hideHeader
      title={t('social.friends.title')}
      size="lg"
      fullScreen
      slideFrom="right"
      bodyClassName="p-0! flex-1 min-h-0 overflow-hidden"
    >
      <FriendsPage onBack={onClose} />
    </AppModal>
  );
}
