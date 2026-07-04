'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { useConfigStore } from '@/core-ui/stores';
import { MapObjectType, PurchaseMapItemResponseDTO } from '@/core-ui/types';
import { authFetch } from '@/networks/stellar/walletSession';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface PurchaseMapItemInput {
  type: MapObjectType;
  variant: number;
  quantity?: number;
}

/**
 * Compra un ítem del catálogo de mapa. El backend descuenta las monedas del
 * ledger y suma el ítem al inventario; acá se invalidan las queries de
 * monedas y de objetos disponibles para que la UI refleje ambos al instante.
 */
export const usePurchaseMapItem = () => {
  const { network, walletAddress } = useConfigStore();
  const queryClient = useQueryClient();

  return useMutation<PurchaseMapItemResponseDTO, Error, PurchaseMapItemInput>({
    mutationFn: async ({ type, variant, quantity = 1 }) => {
      if (!walletAddress) throw new Error('Wallet not connected');
      const response = await authFetch(
        `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/profile/wallet/${walletAddress}/map-items/purchase`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, variant, quantity }),
        },
        walletAddress
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.status !== 'success') {
        throw new Error(data?.message || 'Purchase failed');
      }
      return data.data as PurchaseMapItemResponseDTO;
    },
    onSuccess: () => {
      // Sin await: el modal de éxito aparece al instante y las queries se
      // refrescan en segundo plano (la respuesta ya trae el saldo nuevo).
      void queryClient.invalidateQueries({
        queryKey: ['profile', network?.networkName, walletAddress, 'profile-rewards'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['profile', network?.networkName, walletAddress, 'profile-map-objects-available'],
      });
    },
  });
};
