'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell } from 'react-icons/fi';
import { useInstallApp, usePushNotifications } from '../../hooks';
import { useModalQueueStore } from '../../stores';
import { Button } from '../atoms';
import { AppModal } from '../molecules';

// Se ofrece UNA vez por dispositivo; después el interruptor vive en
// /profile/notifications. Por dispositivo en localStorage, igual que
// [[useIntroSeen]] / vaquita:install-dismissed.
const NUDGE_SEEN_KEY = 'vaquita:push-nudge-seen';

/**
 * Nudge de activación de notificaciones, sólo dentro de la app instalada
 * (standalone): ahí es donde el push de iOS funciona, y el usuario acaba de
 * pasar por instalar + loguearse. El botón "Activar" es el gesto de usuario
 * que iOS exige para `Notification.requestPermission()`.
 *
 * Sólo aparece con permiso 'default' (nunca pedido): si ya está granted, la
 * suscripción la re-sincroniza <PushSubscriptionSync>; si está denied, pedirlo
 * de nuevo no abriría ningún prompt.
 */
export function PushNudge() {
  const { t } = useTranslation();
  const { isStandalone } = useInstallApp();
  const { supported, permission, enablePush } = usePushNotifications();
  // The home tour owns the whole screen while it runs; this would open on top.
  const homeTourSettled = useModalQueueStore((s) => s.homeTourSettled);

  const [seen, setSeen] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(NUDGE_SEEN_KEY) === 'true'
  );
  const [enabling, setEnabling] = useState(false);

  const dismiss = () => {
    window.localStorage.setItem(NUDGE_SEEN_KEY, 'true');
    setSeen(true);
  };

  const handleEnable = async () => {
    if (enabling) return;
    setEnabling(true);
    try {
      await enablePush();
    } finally {
      setEnabling(false);
      dismiss();
    }
  };

  const open = isStandalone && supported && permission === 'default' && !seen && homeTourSettled;
  if (!open) return null;

  return (
    <AppModal open onOpenChange={dismiss} title={t('onboarding.pushNudge.title', 'Turn on notifications')} size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/30 border border-black text-black">
            <FiBell className="h-5 w-5" />
          </span>
          <p className="text-sm text-black/80">
            {t(
              'onboarding.pushNudge.body',
              'Get a heads-up when your savings earn rewards or your streak is about to break.'
            )}
          </p>
        </div>
        <Button type="primary" wFull onPress={handleEnable} isLoading={enabling}>
          {t('onboarding.pushNudge.enable', 'Turn on')}
        </Button>
        <button
          onClick={dismiss}
          className="text-sm font-semibold text-black/50 hover:text-black underline underline-offset-2 transition"
        >
          {t('onboarding.pushNudge.later', 'Maybe later')}
        </button>
      </div>
    </AppModal>
  );
}
