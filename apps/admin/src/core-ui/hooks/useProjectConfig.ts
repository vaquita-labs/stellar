import { clientEnv } from '@/core-ui/config/clientEnv';
import { useQuery } from '@tanstack/react-query';

/**
 * Shape of the singleton `config` row as returned by the admin API route. The
 * route is same-origin (Next.js Route Handler) and returns the Prisma object
 * directly, so fields are camelCase. When the table is empty the route returns
 * the empty-values shape with `id: null` (so the UI can offer to create it).
 */
/** A fiat display currency offered in the web UI's Preferences page. */
export interface Currency {
  id: string;
  label: string;
  hint?: string;
}

export interface ProjectConfig {
  id: number | null;
  networkName: string;
  origins: string[];
  networkPassphrase: string | null;
  badgesContractAddress: string | null;
  currencies: Currency[];
  createdAt: string | null;
  updatedAt: string | null;
}

/** Payload accepted by PATCH /api/config. */
export interface ProjectConfigPayload {
  networkName?: string;
  origins?: string[];
  networkPassphrase?: string | null;
  badgesContractAddress?: string | null;
  currencies?: Currency[];
}

// Same-origin route handler inside this admin app — no NEXT_PUBLIC_SERVICES_URL.
const PROJECT_CONFIG_URL = '/api/config';

// The admin secret guard lives server-side in the route handler; we still echo
// the secret header so the check passes when ADMIN_SECRET is configured.
const adminHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(clientEnv.NEXT_PUBLIC_ADMIN_SECRET
    ? { 'x-admin-secret': clientEnv.NEXT_PUBLIC_ADMIN_SECRET }
    : {}),
});

/**
 * Read the singleton project configuration. The API always returns a config
 * object — with `id: null` and empty values until the row is created.
 */
export const useProjectConfig = () =>
  useQuery<ProjectConfig>({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const response = await fetch(PROJECT_CONFIG_URL, { headers: adminHeaders() });
      const data = await response.json();
      return data?.data?.config as ProjectConfig;
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

/**
 * Upsert the singleton project config. Creates the row on first save (name
 * required), updates it afterwards. Throws with a readable message on failure.
 */
export const updateProjectConfig = async (
  payload: ProjectConfigPayload,
): Promise<ProjectConfig> => {
  const response = await fetch(PROJECT_CONFIG_URL, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseError(response, 'Failed to save project config'));
  const data = await response.json();
  return data?.data?.config as ProjectConfig;
};
