import { PoolV2 } from '@blend-capital/blend-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useConfigStore } from '@/core-ui/stores';
import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { getNetworkPassphrase, getRpcUrl, getStellarNetwork } from '@/networks/stellar/kit';

export interface BlendPosition {
  /** Colateral suministrado directo a Blend, en USDC (unidades humanas). */
  usdc: number;
  /** APY de supply del pool para ese USDC, en porcentaje (ej. 0.1 = 0.1%). */
  apy: number;
}

const EMPTY: BlendPosition = { usdc: 0, apy: 0 };

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
      return {
        usdc: Number.isFinite(usdc) ? usdc : 0,
        apy: (reserve.estSupplyApy ?? 0) * 100,
      };
    },
    enabled: !!walletAddress && !!config,
    // La posición solo cambia al depositar/retirar; 60s es de sobra y mantiene
    // el RPC tranquilo. Tras un depósito, invalidar esta query fuerza el refresh.
    staleTime: 60_000,
    // --- Robustez con dinero ---------------------------------------------------
    // Es plata: el saldo NO puede parpadear a $0 ni bajar por un blip del RPC.
    // 1) keepPreviousData: durante un refetch se sigue mostrando el último valor
    //    conocido, nunca `undefined` a mitad de camino.
    placeholderData: keepPreviousData,
    // 2) Refresco en background al volver al home / foco: la lectura on-chain se
    //    actualiza sin spinner (el valor persistido sigue en pantalla). Pisa a
    //    propósito el refetchOnMount:false global, porque el saldo debe estar al
    //    día. Al no haber `undefined`, no hay flash a cero.
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // 3) Reintentos con backoff: un parpadeo del RPC no debe convertirse en
    //    "no sé cuánto tenés". Recién tras varios fallos se considera error.
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
};

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * Igual que `useBlendPosition` pero además devuelve `live`: el saldo de Blend
 * PROYECTADO en vivo = snapshot on-chain + el interés estimado devengado desde el
 * último fetch, avanzando cada 250ms. Al próximo refetch (60s) el snapshot snapea
 * al valor real y la proyección arranca de nuevo desde ahí.
 *
 * Por qué existe: el header y el retiro deben mostrar (y mover) EL MISMO número.
 * Antes el header proyectaba y el retiro usaba el snapshot crudo, y a 7 decimales
 * uno "crecía" y el otro no → parecían saldos distintos. Leyendo ambos de `live`,
 * coinciden. `live` no es plata inventada: es un estimado de lo que YA se devengó
 * on-chain (el snapshot está algo viejo). El retiro-todo (sentinel i128::MAX)
 * igual toma el total real al ejecutar, así que mostrar el estimado es seguro.
 *
 * `now` es por-componente (un intervalo propio), así que dos consumidores pueden
 * estar hasta 250ms desfasados; a las tasas reales eso es < 10⁻⁸, por debajo del
 * 7º decimal, así que el número mostrado es el mismo.
 */
export const useLiveBlendUsdc = (walletAddress?: string) => {
  const query = useBlendPosition(walletAddress);
  const settled = query.data?.usdc ?? 0;
  const apy = query.data?.apy ?? 0;
  const updatedAt = query.dataUpdatedAt;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const ratePerMs = (settled * (apy / 100)) / MS_PER_YEAR;
  const elapsed = updatedAt ? Math.max(0, now - updatedAt) : 0;
  const live = settled + ratePerMs * elapsed;

  return { ...query, live, settled, apy };
};
