import { prisma } from '@vaquita/db';
import webPush from 'web-push';

/**
 * Envío de web-push (lado servidor). Complemento de `push.ts` (suscripciones):
 * esto lo consumen el endpoint admin de la API y las rutas server-side del
 * admin (apps/admin) — nunca el navegador.
 *
 * VAPID viene de process.env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT) y es OPCIONAL a propósito: sin claves el sender queda
 * apagado (todo envío reporta `disabled: true`) en vez de tirar el proceso —
 * el push es un canal best-effort, no infraestructura crítica.
 *
 * Contrato de fiabilidad: `sendWebPush*` nunca lanza por fallas de entrega.
 * Un push service que responde 404/410 significa "esta suscripción ya no
 * existe" (app desinstalada, permiso revocado) y la fila se poda en el acto.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Ruta interna abierta al tocar la notificación (p.ej. "/home"). */
  link?: string | undefined;
  /** Dos pushes con el mismo tag colapsan en una sola notificación. */
  tag?: string | undefined;
};

export type PushSendResult = {
  /** Suscripciones a las que el push service aceptó el mensaje. */
  sent: number;
  /** Fallas transitorias (timeout, 5xx del push service). */
  failed: number;
  /** Suscripciones muertas (404/410) borradas de la tabla. */
  pruned: number;
  /** true cuando faltan las claves VAPID y no se intentó nada. */
  disabled: boolean;
};

const EMPTY: PushSendResult = { sent: 0, failed: 0, pruned: 0, disabled: false };

let vapidConfigured: boolean | null = null;

/** Configura VAPID una sola vez; false (con warn) si faltan las claves. */
const ensureVapid = (): boolean => {
  if (vapidConfigured !== null) return vapidConfigured;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:hello@vaquita.fi';
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — web push disabled');
    vapidConfigured = false;
    return false;
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
};

type SubscriptionRow = { id: number; endpoint: string; p256dh: string; auth: string };

/** Envía a un lote de filas de suscripción, podando las muertas. */
const sendToSubscriptions = async (rows: SubscriptionRow[], payload: PushPayload): Promise<PushSendResult> => {
  if (!ensureVapid()) return { ...EMPTY, disabled: true };
  if (rows.length === 0) return { ...EMPTY };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link ?? '/',
    ...(payload.tag ? { tag: payload.tag } : {}),
  });

  const results = await Promise.allSettled(
    // Callback async a propósito: web-push valida el endpoint/claves de forma
    // SÍNCRONA y un throw ahí se escaparía del allSettled tirando el lote
    // entero; async lo convierte en rejection del item.
    rows.map(async (row) =>
      webPush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
        { TTL: 60 * 60 * 24 } // 24h: si el dispositivo está offline más que eso, el mensaje caduca
      )
    )
  );

  const deadIds: number[] = [];
  let sent = 0;
  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      sent += 1;
      return;
    }
    // Clasificación por statusCode (no instanceof): cubre WebPushError venga de
    // la instancia de web-push que venga, y errores pre-HTTP (claves corruptas)
    // caen en `failed` como corresponde.
    const status = (result.reason as { statusCode?: number } | null)?.statusCode;
    if (status === 404 || status === 410) {
      deadIds.push(rows[i]!.id);
    } else {
      failed += 1;
      console.warn('[push] send failed', { endpoint: rows[i]!.endpoint.slice(0, 60) }, result.reason);
    }
  });

  if (deadIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: deadIds } } });
  }

  return { sent, failed, pruned: deadIds.length, disabled: false };
};

/**
 * Push a todos los dispositivos de una wallet. Respeta la preferencia "push"
 * del perfil (default on: sólo `false` explícito lo apaga) salvo que se pase
 * `ignorePreference` (p.ej. avisos críticos de cuenta).
 */
export const sendWebPushToWallet = async (
  walletAddress: string,
  payload: PushPayload,
  opts: { ignorePreference?: boolean } = {}
): Promise<PushSendResult> => {
  const profile = await prisma.profile.findUnique({
    where: { walletAddress },
    select: { id: true, notificationPreferences: true },
  });
  if (!profile) return { ...EMPTY };

  if (!opts.ignorePreference) {
    const prefs = profile.notificationPreferences as { push?: boolean } | null;
    if (prefs?.push === false) return { ...EMPTY };
  }

  const rows = await prisma.pushSubscription.findMany({
    where: { profileId: profile.id },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  return sendToSubscriptions(rows, payload);
};

// Cuántos perfiles se procesan a la vez en un envío masivo: adentro cada grupo
// ya paraleliza sus dispositivos, esto sólo evita miles de sockets simultáneos.
const BULK_CONCURRENCY = 20;

/**
 * Push masivo a varios perfiles (audiencia del admin). `payloadFor` permite
 * personalizar por perfil (p.ej. reemplazar {username}); los perfiles con la
 * preferencia "push" apagada se saltan. Agrega los resultados de todos.
 *
 * Bulk de verdad: UNA query trae todas las suscripciones y los envíos van en
 * paralelo por tandas — la versión secuencial (query + envío por perfil)
 * tardaba minutos con cientos de perfiles y colgaba al admin.
 */
export const sendWebPushToProfiles = async (
  profileIds: number[],
  payloadFor: (profile: { id: number; nickname: string | null }) => PushPayload
): Promise<PushSendResult> => {
  if (!ensureVapid()) return { ...EMPTY, disabled: true };
  if (profileIds.length === 0) return { ...EMPTY };

  const profiles = await prisma.profile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true, nickname: true, notificationPreferences: true },
  });
  const eligible = profiles.filter(
    (p) => (p.notificationPreferences as { push?: boolean } | null)?.push !== false
  );
  if (eligible.length === 0) return { ...EMPTY };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { profileId: { in: eligible.map((p) => p.id) } },
    select: { id: true, endpoint: true, p256dh: true, auth: true, profileId: true },
  });
  const rowsByProfile = new Map<number, SubscriptionRow[]>();
  for (const sub of subscriptions) {
    const list = rowsByProfile.get(sub.profileId) ?? [];
    list.push(sub);
    rowsByProfile.set(sub.profileId, list);
  }

  const withDevices = eligible.filter((p) => rowsByProfile.has(p.id));
  const total: PushSendResult = { ...EMPTY };
  for (let i = 0; i < withDevices.length; i += BULK_CONCURRENCY) {
    const batch = withDevices.slice(i, i + BULK_CONCURRENCY);
    const results = await Promise.all(
      batch.map((profile) => sendToSubscriptions(rowsByProfile.get(profile.id)!, payloadFor(profile)))
    );
    for (const result of results) {
      total.sent += result.sent;
      total.failed += result.failed;
      total.pruned += result.pruned;
    }
  }
  return total;
};
