'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FriendsPage } from './FriendsPage';
import { SearchFriendsPage } from './SearchFriendsPage';
import { StackedPanelModal } from './StackedPanelModal';

/**
 * "Buscar amigos" como pantalla apilada sobre el perfil: entra de derecha a
 * izquierda y sale por donde vino, con el perfil quieto debajo. Y "Buscar por
 * nombre" apilado a su vez sobre este panel.
 *
 * Todo son paneles (mismo tratamiento que <SettingsModal>): antes "Buscar por
 * nombre" era un <Link> a /profile/friends/search, así que Next desmontaba el
 * perfil y este panel; al desmontarse, su cleanup hacía history.back() y el
 * modal se cerraba dejándote en /profile/friends. Ahora la sub-pantalla se abre
 * como panel apilado (onOpenSearch) y volver revela Amigos sin recargar. Las
 * rutas siguen existiendo para deep-links: en modo ruta suelta (sin onOpenSearch)
 * la fila sigue siendo un <Link>.
 */
export function FriendsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // Si "Buscar por nombre" está apilado sobre Amigos.
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = () => setSearchOpen(false);

  // Si Amigos se cierra desde afuera, no dejamos la búsqueda colgada.
  useEffect(() => {
    if (!open) setSearchOpen(false);
  }, [open]);

  return (
    <>
      <StackedPanelModal
        open={open}
        onClose={onClose}
        url="/profile/friends"
        title={t('social.friends.title')}
      >
        <FriendsPage onBack={onClose} onOpenSearch={() => setSearchOpen(true)} />
      </StackedPanelModal>

      <StackedPanelModal
        open={searchOpen}
        onClose={closeSearch}
        url="/profile/friends/search"
        title={t('social.search.title')}
      >
        <SearchFriendsPage onBack={closeSearch} />
      </StackedPanelModal>
    </>
  );
}
