import { PoolV2 } from '@blend-capital/blend-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { VOLATILE_QUERY_OPTIONS } from '../config/queryFreshness';
import { useConfigStore } from '@/core-ui/stores';
import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { getNetworkPassphrase, getRpcUrl, getStellarNetwork } from '@/networks/stellar/kit';
import { useLiveTick } from './useLiveTick';

export interface BlendPosition {
  /** Colateral suministrado directo a Blend, en USDC (unidades humanas). */
  usdc: number;
  /** APY de supply del pool para ese USDC, en porcentaje (ej. 0.1 = 0.1%). */
  apy: number;
  /** Deuda (liabilities) del usuario en ese reserve, en USDC. >0 bloquea el
   *  retiro total de Blend (health check), lo que importa para la migración. */
  borrow: number;
}

const EMPTY: BlendPosition = { usdc: 0, apy: 0, borrow: 0 };

/**
 * Lee la posición de depósito DIRECTO a Blend del usuario, on-chain y en vivo.
 * El pool + USDC salen del token activo del project config (DB → API → store)
 * y se consulta el colateral del usuario en el pool.
 *
 * Sin caché propia todavía: el `staleTime` de react-query evita martillar el RPC
 * (la posición solo cambia al depositar/retirar). El caché en DB + cron llega
 * cuando la carga RPC lo justifique, no antes.
 */
export const useBlendPosition = (walletAddress?: string) => {
  const token = useConfigStore((s) => s.token);
  const config = blendConfigForToken(token);

  return useQuery<BlendPosition>({
    queryKey: ['blend-position', getStellarNetwork(), config?.poolId, walletAddress],
    queryFn: async () => {
      if (!walletAddress || !config) return EMPTY;
      const network = { rpc: getRpcUrl(), passphrase: getNetworkPassphrase() };
      const pool = await PoolV2.load(network, config.poolId);
      const reserve = pool.reserves.get(config.usdcId);
      if (!reserve) return EMPTY;

      const user = await pool.loadUser(walletAddress);
      const usdc = user.getCollateralFloat(reserve);
      const borrow = user.getLiabilitiesFloat(reserve);
      return {
        usdc: Number.isFinite(usdc) ? usdc : 0,
        apy: (reserve.estSupplyApy ?? 0) * 100,
        borrow: Number.isFinite(borrow) ? borrow : 0,
      };
    },
    enabled: !!walletAddress && !!config,
    // --- Robustez con dinero ---------------------------------------------------
    // Es plata: el saldo NO puede parpadear a $0 ni bajar por un blip del RPC.
    // 1) keepPreviousData: durante un refetch se sigue mostrando el último valor
    //    conocido, nunca `undefined` a mitad de camino.
    placeholderData: keepPreviousData,
    // 2) El preset revalida al montar, al volver el foco y al reconectar, con
    //    60s de gracia para no martillar el RPC. El valor persistido sigue en
    //    pantalla mientras corre el refetch, así que no hay spinner ni flash a
    //    cero. Tras un depósito, invalidar esta query fuerza el refresh igual.
    ...VOLATILE_QUERY_OPTIONS,
    // 3) Reintentos con backoff: un parpadeo del RPC no debe convertirse en
    //    "no sé cuánto tenés". Recién tras varios fallos se considera error.
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
};

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * `useBlendPosition` + los ingredientes para PROYECTAR el saldo en vivo: el
 * snapshot on-chain (`settled`), cuánto rinde por milisegundo (`ratePerMs`) y
 * desde cuándo corre esa proyección (`updatedAt`, el momento del fetch).
 *
 * No tickea ni re-renderiza: es la versión para quien pinta el número por fuera
 * de React (ver <LiveBalance>, que escribe el DOM en cada tick sin render). Si
 * el número tiene que participar del render, usá `useLiveBlendUsdc`.
 */
export const useBlendUsdc = (walletAddress?: string) => {
  const query = useBlendPosition(walletAddress);
  const settled = query.data?.usdc ?? 0;
  const apy = query.data?.apy ?? 0;
  const ratePerMs = (settled * (apy / 100)) / MS_PER_YEAR;

  return { ...query, settled, apy, ratePerMs, updatedAt: query.dataUpdatedAt };
};

/** Snapshot + lo devengado desde el fetch hasta `now`. */
export const projectBlendUsdc = (settled: number, ratePerMs: number, updatedAt: number, now: number) =>
  settled + ratePerMs * (updatedAt ? Math.max(0, now - updatedAt) : 0);

/**
 * Igual que `useBlendUsdc` pero además devuelve `live`: el saldo de Blend
 * PROYECTADO en vivo = snapshot on-chain + el interés estimado devengado desde el
 * último fetch, avanzando con el tick compartido. Al próximo refetch (60s) el
 * snapshot snapea al valor real y la proyección arranca de nuevo desde ahí.
 *
 * Por qué existe: el header y el retiro deben mostrar (y mover) EL MISMO número.
 * Antes el header proyectaba y el retiro usaba el snapshot crudo, y a 7 decimales
 * uno "crecía" y el otro no → parecían saldos distintos. Leyendo ambos de `live`,
 * coinciden. `live` no es plata inventada: es un estimado de lo que YA se devengó
 * on-chain (el snapshot está algo viejo). El retiro-todo (sentinel i128::MAX)
 * igual toma el total real al ejecutar, así que mostrar el estimado es seguro.
 *
 * El `now` sale de `useLiveTick`, un único timer para toda la app: todos los
 * consumidores avanzan en el mismo frame, así que no hay dos saldos desfasados
 * en pantalla. Ojo: esto re-renderiza al componente 4 veces por segundo — no lo
 * uses en algo que esté montado sobre el mapa (ver la nota en `useLiveTick`).
 */
export const useLiveBlendUsdc = (walletAddress?: string) => {
  const position = useBlendUsdc(walletAddress);
  const now = useLiveTick();

  return {
    ...position,
    live: projectBlendUsdc(position.settled, position.ratePerMs, position.updatedAt, now),
  };
};
