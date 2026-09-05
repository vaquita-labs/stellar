import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * Shape of a `campaigns` row as returned by the admin API route. Dates are ISO
 * strings — the route serializes them so the payload survives JSON.
 */
export interface Campaign {
  id: number;
  code: string;
  name: string;
  source: string | null;
  medium: string | null;
  content: string | null;
  landingPath: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignCreatePayload {
  code: string;
  name: string;
  source?: string | null;
  medium?: string | null;
  content?: string | null;
  landingPath?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface CampaignUpdatePayload extends CampaignCreatePayload {
  id: number;
}

// Same-origin route handler inside this admin app.
const CAMPAIGNS_URL = '/api/admin/campaigns';

const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET } : {}),
});

/** Read every live campaign. */
export const useCampaigns = () =>
  useQuery<Campaign[]>({
    queryKey: ['admin', 'campaigns'],
    queryFn: async () => {
      const response = await fetch(CAMPAIGNS_URL, { headers: adminHeaders() });
      const data = await response.json();
      return (data?.data?.campaigns ?? []) as Campaign[];
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

export const createCampaign = async (payload: CampaignCreatePayload): Promise<Campaign> => {
  const response = await fetch(CAMPAIGNS_URL, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to create campaign'));
  const data = await response.json();
  return data?.data?.campaign as Campaign;
};

export const updateCampaign = async (payload: CampaignUpdatePayload): Promise<Campaign> => {
  const response = await fetch(CAMPAIGNS_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to update campaign'));
  const data = await response.json();
  return data?.data?.campaign as Campaign;
};

/** Soft-delete: attributed profiles keep pointing at the row. */
export const deleteCampaign = async (id: number): Promise<void> => {
  const response = await fetch(`${CAMPAIGNS_URL}?id=${id}`, { method: 'DELETE', headers: adminHeaders() });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to delete campaign'));
};

// Where the shareable link points when NEXT_PUBLIC_APP_URL isn't configured.
const DEFAULT_APP_URL = 'https://app.vaquita.fi';

/**
 * The link marketing actually pastes. Built here rather than by hand because a
 * campaign whose `utm_*` don't match its `code` produces two different answers
 * to "where did this user come from", and nobody notices until the numbers are
 * already wrong.
 */
export const buildCampaignLink = (campaign: Campaign): string => {
  const base = (clientEnv.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, '');
  const path = campaign.landingPath?.startsWith('/') ? campaign.landingPath : '/';

  const params = new URLSearchParams({ ref: campaign.code });
  if (campaign.source) params.set('utm_source', campaign.source);
  if (campaign.medium) params.set('utm_medium', campaign.medium);
  // `utm_campaign` is always the code, never the display name: the name is
  // editable prose and would fragment the same campaign across analytics.
  params.set('utm_campaign', campaign.code);
  if (campaign.content) params.set('utm_content', campaign.content);

  return `${base}${path}?${params.toString()}`;
};
