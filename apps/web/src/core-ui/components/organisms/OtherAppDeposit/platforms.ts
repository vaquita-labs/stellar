import type { DepositPlatformDTO, NetworkResponseDTO } from '../../../types';

/**
 * Las plataformas del catálogo que tienen camino hoy.
 *
 * 'direct' (USDC en Stellar) siempre. 'bridge' sólo si el puente está prendido
 * (`config.bridge_enabled`) y es USDT en Polygon, la única ruta que el puente
 * sabe traer; una entrada 'bridge' con otra red queda afuera aunque esté
 * habilitada en el catálogo.
 */
export const routablePlatforms = (network: NetworkResponseDTO | null | undefined): DepositPlatformDTO[] =>
  (network?.depositPlatforms ?? []).filter(
    (p) =>
      p.tier === 'direct' ||
      (p.tier === 'bridge' && network?.bridgeEnabled !== false && p.network === 'polygon' && p.asset === 'USDT'),
  );

/** El puente abierto en Polygon USDT, con el nombre de la app arriba. */
export const bridgeHref = (platform: DepositPlatformDTO) =>
  `/profile/wallet?bridge=1&source=polygon-usdt&from=${encodeURIComponent(platform.id)}`;
