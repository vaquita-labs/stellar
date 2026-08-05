import { prisma } from '@vaquita/db';
import { ably } from '../ably';
import { sendWebPushToProfiles } from './pushSender';

/**
 * Envío de una campaña del admin: in-app (campanita, con broadcast Ably para
 * el refetch en vivo) + web push, y snapshot en `push_campaigns`.
 *
 * Vive en shared pero SOLO debe ejecutarla el servicio API (ruta admin de
 * apps/api): `notify()` arrastra el cliente Ably, cuyo env (ABLY_KEY y resto
 * de apiServicesEnv) únicamente existe allí. La ruta del admin (apps/admin)
 * proxea al API en vez de importar esto — importarlo mataría su proceso Next
 * por el process.exit(1) del env validator.
 */

export type AdminCampaignInput = {
  title: string;
  body: string;
  /** Ruta interna (p.ej. "/home") abierta al tocar la notificación. */
  link?: string | null;
  audience: 'all' | 'usernames';
  /** Nicknames objetivo cuando audience='usernames'. */
  usernames?: string[];
};

export type AdminCampaignResult =
  | { ok: false; message: string }
  | {
      ok: true;
      campaign: {
        id: number;
        title: string;
        body: string;
        link: string | null;
        audience: string;
        usernames: unknown;
        recipients: number;
        pushSent: number;
        pushFailed: number;
        pushPruned: number;
        createdAt: Date;
      };
      push: { sent: number; failed: number; pruned: number; disabled: boolean };
      notFound: string[];
    };

/** Reemplaza {username} por el nickname (o un fallback neutro). */
const personalize = (template: string, username: string | null): string =>
  template.replaceAll('{username}', username ?? 'vaquita');

export const sendAdminCampaign = async (input: AdminCampaignInput): Promise<AdminCampaignResult> => {
  const usernames = Array.from(
    new Set((input.usernames ?? []).map((u) => u.trim().toLowerCase()).filter(Boolean))
  );

  if (input.audience === 'usernames' && usernames.length === 0) {
    return { ok: false, message: 'At least one username is required for the usernames audience.' };
  }

  // Resolver la audiencia a perfiles vivos.
  const profiles = await prisma.profile.findMany({
    where:
      input.audience === 'all'
        ? { deletedAt: null }
        : { deletedAt: null, nickname: { in: usernames } },
    select: { id: true, walletAddress: true, nickname: true },
  });

  const foundNicknames = new Set(profiles.map((p) => p.nickname).filter(Boolean) as string[]);
  const notFound = input.audience === 'usernames' ? usernames.filter((u) => !foundNicknames.has(u)) : [];

  if (profiles.length === 0) {
    return {
      ok: false,
      message: `No profiles matched the audience.${notFound.length ? ` Unknown: ${notFound.join(', ')}` : ''}`,
    };
  }

  const link = input.link?.trim() || null;

  // 1) In-app para todos (personalizado), en UN solo insert. Nada de
  //    `notify()` en loop: con cientos de perfiles, un round-trip de DB +
  //    publish de Ably por cabeza tarda minutos y el admin se queda colgado.
  await prisma.notification.createMany({
    data: profiles.map((profile) => ({
      profileId: profile.id,
      type: 'system',
      messageKey: 'adminMessage',
      params: {
        title: personalize(input.title, profile.nickname),
        body: personalize(input.body, profile.nickname),
      },
      link,
    })),
  });

  // Un ÚNICO broadcast: un mensaje sin `walletAddress` hace que TODOS los
  // clientes refetcheen su feed (ListenNotificationsChanges sólo filtra
  // cuando el mensaje trae una wallet ajena). Best-effort: si Ably falla, la
  // campanita se actualiza en la próxima carga igual.
  try {
    await ably.channels.get('notifications-changes').publish('change', { timestamp: Date.now() });
  } catch (error) {
    console.warn('[push] ably broadcast failed', error);
  }

  // 2) Push a los dispositivos suscritos (personalizado por perfil).
  const push = await sendWebPushToProfiles(
    profiles.map((p) => p.id),
    (profile) => ({
      title: personalize(input.title, profile.nickname),
      body: personalize(input.body, profile.nickname),
      link: link ?? '/',
    })
  );

  const campaign = await prisma.pushCampaign.create({
    data: {
      title: input.title,
      body: input.body,
      link,
      audience: input.audience,
      ...(input.audience === 'usernames' ? { usernames } : {}),
      recipients: profiles.length,
      pushSent: push.sent,
      pushFailed: push.failed,
      pushPruned: push.pruned,
    },
  });

  return { ok: true, campaign, push, notFound };
};
