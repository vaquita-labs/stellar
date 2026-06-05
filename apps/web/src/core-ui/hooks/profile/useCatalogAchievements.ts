import { clientEnv } from '@/core-ui/config/clientEnv';
import type { CatalogBadgeMeta } from '@/core-ui/data/profile-badges';
import { useQuery } from '@tanstack/react-query';

type CatalogApiAchievement = {
  key: string;
  name: string;
  description: string;
  tier?: string;
  icon?: string | null;
  accent?: string | null;
};

/**
 * Backend badge catalog (user-agnostic metadata) used to drive the profile /
 * trophy-room grid. Returns `[]` on failure so `buildAchievements` falls back to
 * its static metadata.
 */
export const useCatalogAchievements = () =>
  useQuery<CatalogBadgeMeta[]>({
    queryKey: ['achievements', 'catalog'],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/badges`,
        );
        const data = await response.json();
        const list = data?.data?.achievements as CatalogApiAchievement[] | undefined;
        if (!Array.isArray(list)) return [];
        return list.map((a) => ({
          id: a.key,
          title: a.name,
          description: a.description,
          icon: a.icon ?? `/icons/achievements/${a.key}.png`,
          accent: a.accent ?? undefined,
          tier: a.tier as CatalogBadgeMeta['tier'],
        }));
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });
