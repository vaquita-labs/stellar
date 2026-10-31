import { usePollar } from '@pollar/react';
import { useQuery } from '@tanstack/react-query';

/**
 * Whether the app has any card provider enabled on its Pollar network. An empty
 * list is Pollar's way of saying Cards is off, so the entry point stays hidden.
 * A failed read hides it too: the card modal cannot do anything without one.
 */
export function useCardsEnabled(): boolean {
  const { getClient, wallet } = usePollar();
  const { data } = useQuery({
    queryKey: ['pollar', 'card-providers'],
    queryFn: () => getClient().getCardProviders(),
    enabled: !!wallet,
    staleTime: 10 * 60 * 1000,
  });
  return (data?.length ?? 0) > 0;
}
