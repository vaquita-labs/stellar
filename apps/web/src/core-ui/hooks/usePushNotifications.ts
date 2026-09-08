'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { authFetch } from '@/networks/stellar/walletSession';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

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

// Si ESTE dispositivo tiene una suscripción viva. El permiso no alcanza para
// saberlo: se puede tener `granted` y ninguna suscripción registrada (es
// exactamente el caso que dejaba el toggle de ajustes prendido sin que
// llegara nada). `null` = todavía no lo miramos — la lectura es asíncrona y
// en el servidor no existe.
let subscribedState: boolean | null = null;
const subSubscribers = new Set<() => void>();
const setSubscribed = (next: boolean | null) => {
  if (next !== subscribedState) {
    subscribedState = next;
    subSubscribers.forEach((cb) => cb());
  }
};
const subscribeSub = (cb: () => void) => {
  subSubscribers.add(cb);
  return () => subSubscribers.delete(cb);
};
const getSubSnapshot = () => subscribedState;
const getSubServerSnapshot = (): boolean | null => null;

/** Relee la suscripción del navegador. Silenciosa: nunca pide permiso. */
const refreshSubscription = async (): Promise<void> => {
  if (!isSupported()) {
    setSubscribed(false);
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    setSubscribed(!!subscription);
  } catch {
    setSubscribed(false);
  }
};

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
  const subscribed = useSyncExternalStore(subscribeSub, getSubSnapshot, getSubServerSnapshot);

  // Primera lectura en el cliente. Queda `null` hasta que resuelve, que es lo
  // que la UI usa para no pintar un estado equivocado antes de saberlo.
  useEffect(() => {
    if (subscribedState === null) void refreshSubscription();
  }, []);

  /**
   * Pide permiso (si hace falta) y registra la suscripción en el navegador y
   * en la API. Llamar desde un gesto del usuario (click del toggle / nudge).
   */
  const enablePush = useCallback(async (): Promise<EnablePushResult> => {
    if (!isSupported() || !walletAddress) return 'unsupported';

    try {
      const result = await Notification.requestPermission();
      refreshPermission();
      if (result !== 'granted') {
        setSubscribed(false);
        return 'denied';
      }

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
      const ok = data?.status === 'success';
      setSubscribed(ok);
      return ok ? 'subscribed' : 'error';
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
      if (!subscription) {
        setSubscribed(false);
        return;
      }
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscribed(false);
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
    /**
     * Si este dispositivo tiene una suscripción viva. `null` mientras se lee
     * (y siempre en el servidor): quien pinte a partir de esto debe tratar
     * `null` como "todavía no sé".
     */
    subscribed,
    enablePush,
    disablePush,
  };
}
