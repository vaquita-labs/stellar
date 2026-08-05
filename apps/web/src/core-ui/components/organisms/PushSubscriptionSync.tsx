'use client';

import { useEffect, useRef } from 'react';
import { useProfileData, usePushNotifications } from '../../hooks';

/**
 * Re-sincroniza la suscripción web-push en silencio en cada carga: si el
 * permiso ya está concedido y la preferencia "push" del perfil sigue activa,
 * re-registra el service worker y re-postea la suscripción (el endpoint del
 * push service puede rotar, y el upsert por endpoint de la API mantiene una
 * sola fila por dispositivo). Nunca abre el prompt de permiso — eso sólo pasa
 * desde el toggle en /profile/notifications (gesto del usuario, requisito de
 * iOS).
 */
export function PushSubscriptionSync() {
  const { supported, permission, enablePush } = usePushNotifications();
  const { data } = useProfileData();
  const synced = useRef(false);

  const pushPreferred = data?.notificationPreferences?.push !== false;

  useEffect(() => {
    if (synced.current) return;
    if (!supported || permission !== 'granted' || !pushPreferred || !data) return;
    synced.current = true;
    void enablePush();
  }, [supported, permission, pushPreferred, data, enablePush]);

  return null;
}
