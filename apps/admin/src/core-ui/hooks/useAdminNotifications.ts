import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * Campaña de notificaciones tal como la devuelve /api/admin/notifications
 * (fila de `push_campaigns`, camelCase directo de Prisma).
 */
export interface PushCampaign {
  id: number;
  title: string;
  body: string;
  link: string | null;
  audience: 'all' | 'usernames';
  usernames: string[] | null;
  recipients: number;
  pushSent: number;
  pushFailed: number;
  pushPruned: number;
  createdAt: string;
}

export interface SendCampaignPayload {
  title: string;
  body: string;
  link?: string | null;
  audience: 'all' | 'usernames';
  usernames?: string[];
}

export interface SendCampaignResult {
  campaign: PushCampaign;
  push: { sent: number; failed: number; pruned: number; disabled: boolean };
  /** Usernames pedidos que no matchearon ningún perfil vivo. */
  notFound?: string[];
}

// Same-origin route handler inside this admin app.
const NOTIFICATIONS_URL = '/api/admin/notifications';

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Historial de campañas (últimas 50, más reciente primero). */
export const usePushCampaigns = () =>
  useQuery<PushCampaign[]>({
    queryKey: ['admin', 'push-campaigns'],
    queryFn: async () => {
      const response = await fetch(NOTIFICATIONS_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.campaigns ?? []) as PushCampaign[];
    },
  });

const parseError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    /* ignore */
  }
  return fallback;
};

/** Envía una campaña (in-app + push). Throws con mensaje legible si falla. */
export const sendCampaign = async (payload: SendCampaignPayload): Promise<SendCampaignResult> => {
  const response = await fetch(NOTIFICATIONS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response, 'Send failed'));
  }
  const data = await response.json();
  return data.data as SendCampaignResult;
};
