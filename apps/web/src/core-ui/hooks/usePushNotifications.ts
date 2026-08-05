'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useCallback, useSyncExternalStore } from 'react';

// Suscripción web-push del dispositivo. El toggle "Push notifications" de
// /profile/notifications es el dueño del flujo: al encenderlo se pide permiso
// (requiere gesto del usuario, obligatorio en iOS) y se registra la
// suscripción; <PushSubscriptionSync> la re-sincroniza en silencio en cada
// carga mientras el permiso siga concedido.
//
// En iOS el push SOLO existe dentro de la app instalada (standalone, iOS
// 16.4+): en Safari pestaña `window.Notification` ni siquiera existe y
// `supported` queda false.

const SW_PATH = '/push-sw.js';

// El permiso del navegador no emite eventos al cambiar desde el prompt nativo:
// lo espejamos en un store mínimo para que la UI re-renderice tras pedirlo.
let permissionState: NotificationPermission | 'unsupported' =
  typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
const permSubscribers = new Set<() => void>();
const refreshPermission = () => {
  const next: NotificationPermission | 'unsupported' =
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  if (next !== permissionState) {
    permissionState = next;
    permSubscribers.forEach((cb) => cb());
  }
};
const subscribePerm = (cb: () => void) => {
  permSubscribers.add(cb);
  return () => permSubscribers.delete(cb);
};
const getPermSnapshot = () => permissionState;
const getPermServerSnapshot = (): NotificationPermission | 'unsupported' => 'unsupported';

const isSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  !!clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** `applicationServerKey` espera bytes, no la string base64url de la env. */
const vapidKeyBytes = (): Uint8Array => {
  const base64 = (clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type EnablePushResult = 'subscribed' | 'denied' | 'unsupported' | 'error';

export function usePushNotifications() {
  const walletAddress = useConfigStore((s) => s.walletAddress);
  const permission = useSyncExternalStore(subscribePerm, getPermSnapshot, getPermServerSnapshot);

  /**
   * Pide permiso (si hace falta) y registra la suscripción en el navegador y
   * en la API. Llamar desde un gesto del usuario (click del toggle / nudge).
   */
  const enablePush = useCallback(async (): Promise<EnablePushResult> => {
    if (!isSupported() || !walletAddress) return 'unsupported';

    try {
      const result = await Notification.requestPermission();
      refreshPermission();
      if (result !== 'granted') return 'denied';

      const registration = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes() as BufferSource,
        }));

      const json = subscription.toJSON();
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/notifications/wallet/${walletAddress}/push-subscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        },
        walletAddress
      );
      const data = await response.json();
      return data?.status === 'success' ? 'subscribed' : 'error';
    } catch (error) {
      console.warn('[push] enable failed', error);
      return 'error';
    }
  }, [walletAddress]);

  /** Da de baja la suscripción local y su fila en la API. Idempotente. */
  const disablePush = useCallback(async (): Promise<void> => {
    if (!isSupported() || !walletAddress) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/notifications/wallet/${walletAddress}/push-unsubscribe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        },
        walletAddress
      );
    } catch (error) {
      console.warn('[push] disable failed', error);
    }
  }, [walletAddress]);

  return {
    /** Este navegador puede recibir push (y hay clave VAPID configurada). */
    supported: isSupported(),
    /** Estado actual del permiso de notificaciones ('unsupported' si no aplica). */
    permission,
    enablePush,
    disablePush,
  };
}
