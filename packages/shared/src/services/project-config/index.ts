import { prisma } from '@vaquita/db';
import type { ProjectConfigResponseDTO } from '../../types';
import { toProjectConfig } from './helpers';

export { toProjectConfig };

/**
 * Returns the single project configuration (the app is single-network now), with
 * its supported tokens. Replaces the old getNetworkByName / getNetworks /
 * getNetworksByOrigin functions. Origin-based filtering was dropped — there is
 * exactly one network/config for every origin.
 */
export const getProjectConfig = async (): Promise<ProjectConfigResponseDTO | null> => {
  const config = await prisma.projectConfig.findFirst();
  if (!config) return null;

  const tokens = await prisma.token.findMany({
    where: { deletedAt: null },
  });

  return toProjectConfig(config, tokens);
};
