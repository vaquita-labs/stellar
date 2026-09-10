import { prisma } from '@vaquita/db';
import type { ProjectConfigResponseDTO } from '../../types';
import { toProjectConfig } from './helpers';

export { toProjectConfig };
export { isTokenUsable, tokenReadiness, type TokenReadiness, type TokenReadinessGap } from './readiness';

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
  /**
   * Ceiling on the coins one profile can earn from depositing in a single UTC
   * day, across both savings products. The grant itself is one coin per whole
   * USDC, minimum one USDC.
   */
  depositCoinsDailyCap: number;
}

/**
 * Reads the admin-configurable reward dials. Falls back to the historical
 * defaults (1 coin, 0 XP, 100 deposit coins a day) when the config row doesn't
 * exist yet, so callers never need to special-case a missing singleton.
 */
export const getRewardsConfig = async (): Promise<RewardsConfig> => {
  const config = await prisma.config.findFirst({
    select: { dailyGoldCoins: true, dailyCheckinExperience: true, depositCoinsDailyCap: true },
  });
  return {
    dailyGoldCoins: config?.dailyGoldCoins ?? 1,
    dailyCheckinExperience: config?.dailyCheckinExperience ?? 0,
    depositCoinsDailyCap: config?.depositCoinsDailyCap ?? 100,
  };
};

/** Duración por defecto de un día del reloj de juego (20 min), usada si el
 *  singleton `config` todavía no existe. */
export const DEFAULT_GAME_DAY_LENGTH_MS = 1_200_000;

/**
 * Duración (en milisegundos reales) de un día completo del reloj de juego
 * acelerado, leída en vivo del singleton `config`. Global para todos. Cae al
 * default (20 min) si la fila no existe, así el endpoint nunca falla.
 */
export const getGameDayLengthMs = async (): Promise<number> => {
  const config = await prisma.config.findFirst({
    select: { gameDayLengthMs: true },
  });
  return config?.gameDayLengthMs ?? DEFAULT_GAME_DAY_LENGTH_MS;
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
