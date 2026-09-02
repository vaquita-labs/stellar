'use client';

import { useQuery } from '@tanstack/react-query';
import { getHorizonUrl } from '@/networks/stellar/kit';

export type TrustlineState =
  /** La cuenta no existe en la red: nunca recibió el mínimo de XLM para activarse. */
  | 'unfunded'
  /** Existe pero no tiene la trustline del USDC de este issuer. */
  | 'missing'
  | 'ok';

/**
 * ¿La cuenta destino puede RECIBIR este USDC?
 *
 * `sponsoredUsdcPayment` manda un pago clásico, que rebota con `op_no_trust` si
 * el destino no tiene la trustline. El saldo del SAC no sirve para saberlo: una
 * cuenta sin trustline simula `balance()` en 0, igual que una que sí la tiene y
 * está vacía. La respuesta está en Horizon, que es de donde la saca el on-ramp
 * (`rampsOnramp.ts`) para lo mismo.
 *
 * Filtra por ISSUER además de por código: en testnet conviven varios "USDC" y
 * matchear solo por código resuelve el que no es.
 */
export const useUsdcTrustline = (address: string | null, issuer: string | undefined) =>
  useQuery<TrustlineState>({
    queryKey: ['usdc-trustline', address, issuer],
    queryFn: async () => {
      const res = await fetch(`${getHorizonUrl()}/accounts/${encodeURIComponent(address!)}`, {
        cache: 'no-store',
      });
      if (res.status === 404) return 'unfunded';
      if (!res.ok) throw new Error(`Horizon ${res.status}`);
      const data = (await res.json()) as {
        balances?: Array<{ asset_code?: string; asset_issuer?: string }>;
      };
      const has = (data.balances ?? []).some(
        (b) => b.asset_code?.toUpperCase() === 'USDC' && b.asset_issuer === issuer,
      );
      return has ? 'ok' : 'missing';
    },
    enabled: !!address && !!issuer,
    // Alguien que acaba de abrir la app por primera vez estrena la trustline en
    // ese momento, así que un "no puede recibir" cacheado envejece mal.
    staleTime: 30_000,
    retry: 1,
  });
