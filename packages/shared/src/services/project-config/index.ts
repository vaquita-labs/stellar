import { prisma } from '@vaquita/db';
import type { ProjectConfigResponseDTO } from '../../types';
import { toProjectConfig } from './helpers';

export { toProjectConfig };

/**
 * Lightweight single-column read of the configured network name. Cheaper than
 * {@link getProjectConfig} (no tokens / ABIs) for handlers that only need the
 * name to stamp on a DTO. Single-network: there is exactly one config row.
 */
export const getNetworkName = async (): Promise<string> => {
  const config = await prisma.config.findFirst({ select: { networkName: true } });
  return config?.networkName ?? '';
};

/**
 * Returns the single project configuration that previously powered
 * getNetworkByName, now sourced from the singleton `config` row.
 */
export const getBadgesContractAddress = async (): Promise<string | null> => {
  const config = await prisma.config.findFirst({ select: { badgesContractAddress: true } });
  return config?.badgesContractAddress ?? null;
};

/** Daily check-in reward amounts, sourced live from the singleton `config` row. */
export interface RewardsConfig {
  /** Gold coins granted per daily check-in. */
  dailyGoldCoins: number;
  /** Experience granted per daily check-in (0 disables the bonus). */
  dailyCheckinExperience: number;
}

/**
 * Reads the admin-configurable daily check-in reward amounts. Falls back to the
 * historical defaults (1 coin, 0 XP) when the config row doesn't exist yet, so
 * callers never need to special-case a missing singleton.
 */
export const getRewardsConfig = async (): Promise<RewardsConfig> => {
  const config = await prisma.config.findFirst({
    select: { dailyGoldCoins: true, dailyCheckinExperience: true },
  });
  return {
    dailyGoldCoins: config?.dailyGoldCoins ?? 1,
    dailyCheckinExperience: config?.dailyCheckinExperience ?? 0,
  };
};

/**
 * Returns the single project configuration (the app is single-network now), with
 * its supported tokens. Replaces the old getNetworkByName / getNetworks /
 * getNetworksByOrigin functions. Origin-based filtering was dropped — there is
 * exactly one network/config for every origin.
 */
export const getProjectConfig = async (): Promise<ProjectConfigResponseDTO | null> => {
  const config = await prisma.config.findFirst();
  if (!config) return null;

  const tokens = await prisma.token.findMany({
    where: { deletedAt: null },
  });

  return toProjectConfig(config, tokens);
};
