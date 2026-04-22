import { useQuery } from '@tanstack/react-query';
import { clientEnv } from '../config/clientEnv';

export const useUsers = () => {
  return useQuery<Record<string, unknown>[] | null>({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const response = await fetch(`${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/user`);

        const data = await response.json();

        return data.data ?? {};
      } catch (error) {
        console.error('useDeposits', error);
        return {};
      }
    },
  });
};
