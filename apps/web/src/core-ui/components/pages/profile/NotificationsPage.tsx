'use client';

import { toast } from '@heroui/react';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell, FiLoader, FiMail, FiTrendingUp, FiUsers, FiZap } from 'react-icons/fi';
import { useProfileData, usePushNotifications, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationPreferenceKey } from '../../../types';
import { PageLayout } from '../../molecules';

const SECTIONS: {
  id: string;
  title: string;
  items: { key: NotificationPreferenceKey; icon: React.ReactNode; title: string; description: string }[];
}[] = [
  {
    id: 'channels',
    title: 'Channels',
    items: [
      { key: 'push', icon: <FiBell />, title: 'Push notifications', description: 'Receive alerts on this device.' },
      { key: 'email', icon: <FiMail />, title: 'Email updates', description: 'Get a weekly summary by email.' },
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    items: [
      { key: 'deposits', icon: <FiTrendingUp />, title: 'Deposits & yield', description: 'When your savings earn rewards.' },
      { key: 'streaks', icon: <FiZap />, title: 'Streak reminders', description: 'Daily reminder to keep your streak.' },
      { key: 'friends', icon: <FiUsers />, title: 'Friends activity', description: 'Friends joining or saving.' },
    ],
  },
];

// Bandera "ya estamos en el cliente" sin setState en un efecto: el snapshot del
// servidor es false y el del cliente true, que es exactamente lo que hace falta
// para no pintar estado del navegador durante la hidratación.
const subscribeNoop = () => () => {};

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-black border-b-2 transition-colors ${
        checked ? 'bg-primary' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white border border-black transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function NotificationsPage({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveNotificationPreferences } = useRestProfile();

  const [values, setValues] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [saving, setSaving] = useState<NotificationPreferenceKey | null>(null);
  const { supported: pushSupported, permission, subscribed, enablePush, disablePush } = usePushNotifications();

  // `pushSupported` / `permission` / `subscribed` sólo existen en el navegador:
  // en el servidor dan siempre "no soportado". Pintarlos directo haría que el
  // primer render del cliente no coincida con el HTML, así que hasta montar se
  // muestra la fila como estaba.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  // Hydrate from the saved profile preferences once (and after each refetch).
  useEffect(() => {
    if (data?.notificationPreferences) setValues(data.notificationPreferences);
  }, [data?.notificationPreferences]);

  // The email channel needs an address to send to: locked until the user adds
  // one on the Edit profile page.
  const emailLocked = !isLoading && !data?.email;
  const emailLockedMessage = t(
    'profilePages.notifications.emailRequired',
    'Add your email in Edit profile to enable this.'
  );

  const pushDeniedMessage = t(
    'profilePages.notifications.pushDenied',
    'Notifications are blocked for this app in your browser settings.'
  );
  const pushUnsupportedMessage = t(
    'profilePages.notifications.pushUnsupported',
    'Install the app on your home screen to receive notifications.'
  );

  // Por qué la fila está trabada, o null si se puede tocar. El push depende del
  // dispositivo, no de la preferencia guardada: en una pestaña de Safari en iOS
  // el web push directamente no existe, y con el permiso denegado el prompt ya
  // no vuelve a aparecer. En los dos casos el toggle no puede hacer nada, así
  // que se traba y se explica por qué en vez de quedar prendido mintiendo.
  const lockMessageFor = (key: NotificationPreferenceKey): string | null => {
    if (key === 'email' && emailLocked) return emailLockedMessage;
    if (key === 'push' && mounted) {
      if (!pushSupported) return pushUnsupportedMessage;
      if (permission === 'denied') return pushDeniedMessage;
    }
    return null;
  };

  // El push está encendido sólo si ESTE dispositivo tiene una suscripción viva
  // y además la preferencia del perfil lo permite. `subscribed === null` es
  // "todavía no lo leímos": mientras tanto se muestra la preferencia guardada.
  const checkedFor = (key: NotificationPreferenceKey, locked: boolean): boolean => {
    if (key !== 'push') return values[key];
    if (locked) return false;
    if (!mounted || subscribed === null) return values.push;
    return subscribed && values.push;
  };

  const handleToggle = async (key: NotificationPreferenceKey, value: boolean) => {
    if (!walletAddress || isLoading || saving) return;
    const lockMessage = lockMessageFor(key);
    if (lockMessage) {
      // The toggle is locked; the reason is already on the row, but the tap
      // still deserves an answer instead of nothing happening.
      toast.warning(lockMessage, { timeout: 3000 });
      return;
    }
    const prev = values;
    setValues({ ...prev, [key]: value }); // optimistic; reverted on failure
    setSaving(key);
    try {
      // El toggle de push también maneja la suscripción real del dispositivo:
      // encenderlo pide el permiso del navegador (este click es el gesto que
      // iOS exige) y registra la suscripción; apagarlo la da de baja.
      if (key === 'push' && value && pushSupported) {
        const result = await enablePush();
        if (result === 'denied') {
          setValues(prev);
          toast.warning(pushDeniedMessage, { timeout: 4000 });
          return;
        }
      }
      if (key === 'push' && !value) {
        void disablePush();
      }

      const { success, message } = await saveNotificationPreferences({ [key]: value });
      if (success) {
        refetch();
      } else {
        setValues(prev);
        toast.danger(t('profile.preferences.updateError'), { description: message, timeout: 4000 });
      }
    } catch (error) {
      setValues(prev);
      toast.danger(t('profile.preferences.updateError'), {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <PageLayout
      title={t('profilePages.notifications.title', 'Notifications')}
      backHref={onBack ? undefined : '/profile/settings'}
      onBack={onBack}
    >
      {SECTIONS.map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">
              {t(`profilePages.notifications.sections.${section.id}.title`, section.title)}
            </h2>
            <ul className="rounded-lg border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
              {section.items.map(({ key, icon, title, description }) => {
                const lockMessage = lockMessageFor(key);
                const locked = lockMessage !== null;
                return (
                  <li key={key} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
                        {icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black truncate">
                          {t(`profilePages.notifications.items.${key}.title`, title)}
                        </p>
                        {/* Trabada: el motivo reemplaza a la descripción, a la
                            vista y sin depender del hover (en móvil no existe). */}
                        <p className={`text-xs ${locked ? 'text-amber-700' : 'text-gray-600 truncate'}`}>
                          {lockMessage ?? t(`profilePages.notifications.items.${key}.description`, description)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {saving === key && <FiLoader className="animate-spin text-gray-400" />}
                      <Toggle
                        checked={checkedFor(key, locked)}
                        disabled={locked || !walletAddress || isLoading || saving !== null}
                        onChange={(v) => handleToggle(key, v)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </PageLayout>
  );
}
