'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EditProfilePage } from './EditProfilePage';
import { NotificationsPage } from './NotificationsPage';
import { PreferencesPage } from './PreferencesPage';
import { SettingsPage, type SettingsSubKey } from './SettingsPage';
import { StackedPanelModal } from './StackedPanelModal';
import { WalletPage } from './WalletPage';

/**
 * Ajustes como pantalla apilada sobre el perfil, y sus sub-pantallas
 * (Preferences, Profile, Notifications, Wallet) apiladas a su vez sobre Ajustes.
 * Todo son paneles: entrar y volver revela lo de atrás sin desmontar ni recargar
 * — antes los ítems eran <Link> a rutas reales, así que Next desmontaba el perfil
 * y Ajustes, y al volver se veía la ruta suelta /profile/settings recargada en
 * vez del panel. Las rutas siguen existiendo para deep-links; acá se abren como
 * panel porque Ajustes está en modo modal (le pasa `onBack`/`onOpenSub`).
 */
const SUB_URL: Record<SettingsSubKey, string> = {
  preferences: '/profile/preferences',
  profile: '/profile/edit',
  notifications: '/profile/notifications',
  wallet: '/profile/wallet',
};

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // Qué sub-panel está apilado sobre Ajustes (o ninguno).
  const [sub, setSub] = useState<SettingsSubKey | null>(null);
  const closeSub = () => setSub(null);

  // Si Ajustes se cierra desde afuera, no dejamos un sub-panel colgado.
  useEffect(() => {
    if (!open) setSub(null);
  }, [open]);

  return (
    <>
      <StackedPanelModal
        open={open}
        onClose={onClose}
        url="/profile/settings"
        title={t('profilePages.settings.title', 'Settings')}
      >
        <SettingsPage onBack={onClose} onOpenSub={setSub} />
      </StackedPanelModal>

      <StackedPanelModal
        open={sub === 'preferences'}
        onClose={closeSub}
        url={SUB_URL.preferences}
        title={t('profile.preferences.title')}
      >
        <PreferencesPage onBack={closeSub} />
      </StackedPanelModal>

      <StackedPanelModal
        open={sub === 'profile'}
        onClose={closeSub}
        url={SUB_URL.profile}
        title={t('profilePages.edit.title', 'Edit profile')}
      >
        <EditProfilePage onBack={closeSub} />
      </StackedPanelModal>

      <StackedPanelModal
        open={sub === 'notifications'}
        onClose={closeSub}
        url={SUB_URL.notifications}
        title={t('profilePages.notifications.title', 'Notifications')}
      >
        <NotificationsPage onBack={closeSub} />
      </StackedPanelModal>

      <StackedPanelModal
        open={sub === 'wallet'}
        onClose={closeSub}
        url={SUB_URL.wallet}
        title={t('wallet.page.title')}
      >
        <WalletPage onBack={closeSub} />
      </StackedPanelModal>
    </>
  );
}
