'use client';

import { AppModal, useModalPresence } from '@/core-ui/components/molecules/AppModal';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsPage } from './SettingsPage';

/**
 * Ajustes como pantalla apilada sobre el perfil: entra de derecha a izquierda y
 * sale por donde vino, con el perfil quieto debajo. Mismo tratamiento que
 * <FriendsModal> y el detalle de un movimiento — todo lo que se apila se siente
 * igual.
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // Se monta al abrir y sobrevive a la animación de salida para no cortarla.
  const mounted = useModalPresence(open);

  // La URL acompaña a lo que se ve (/profile/settings) para que el atrás del
  // sistema cierre el panel en vez de saltar de pantalla. pushState superficial:
  // no navega ni desmonta el perfil. Por ref porque `onClose` suele venir
  // inline; en las dependencias rearmaría el efecto en cada render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const settingsUrl = '/profile/settings';
    window.history.pushState(null, '', settingsUrl);
    const onPopState = () => onCloseRef.current();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Sólo deshacemos nuestro pushState cuando Settings se cierra en su lugar
      // (flecha atrás o gesto del sistema): ahí la URL sigue siendo /profile/settings.
      // Si el usuario entró a una sub-página (Preferences, Wallet…), la URL ya
      // avanzó; un history.back() acá cancelaría esa navegación y cerraría
      // Settings de golpe. Dejar la entrada hace que el "atrás" de la sub-página
      // vuelva a /profile/settings, es decir, Settings reaparece.
      if (window.location.pathname === settingsUrl) window.history.back();
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <AppModal
      open={open}
      onOpenChange={onClose}
      // Sin barra propia: adentro va la MISMA pantalla que en /profile/settings,
      // con su PageHeader.
      hideHeader
      title={t('profilePages.settings.title', 'Settings')}
      size="lg"
      fullScreen
      slideFrom="right"
      bodyClassName="p-0! flex-1 min-h-0 overflow-hidden"
    >
      <SettingsPage onBack={onClose} />
    </AppModal>
  );
}
