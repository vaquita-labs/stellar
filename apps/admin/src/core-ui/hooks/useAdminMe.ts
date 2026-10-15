import { useQuery } from '@tanstack/react-query';

export type AdminMe = { email: string; role: 'operator' | 'read-only'; via: 'service' | 'access' | 'passcode' };

/**
 * The current person, from `GET /api/admin/me`. For drawing: hide or disable
 * write controls when `role` is read-only. Enforcement is in every route.
 */
export const useAdminMe = () =>
  useQuery({
    queryKey: ['admin', 'me'],
    queryFn: async (): Promise<AdminMe> => {
      const res = await fetch('/api/admin/me');
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'Could not load the current user');
      return body.data as AdminMe;
    },
    staleTime: 60_000,
  });

export const useIsOperator = (): boolean => useAdminMe().data?.role === 'operator';
