import { withTimeout } from '@/core-ui/helpers';
import { useNetworkConfigStore } from '../../core-ui/stores';
import { getStellarWalletsKit } from './kit';

const STORAGE = {
  walletId: 'swk:walletId',
  address: 'swk:address',
};

export function stellarSession() {
  const connect = async () => {
    try {
      await getStellarWalletsKit().openModal({
        onWalletSelected: async (option) => {
          console.info('[stellarSession] selected wallet:', option?.id);

          // Guarda selección
          getStellarWalletsKit().setWallet(option.id);
          localStorage.setItem(STORAGE.walletId, option.id);

          // Albedo necesita popup -> advierte al usuario
          const isAlbedo = String(option?.id || '')
            .toLowerCase()
            .includes('albedo');

          // getAddress con timeout más largo (albedo suele tardar)
          const addrRes = await withTimeout(
            getStellarWalletsKit().getAddress(),
            isAlbedo ? 15000 : 7000,
            'getAddress(connect)'
          );

          const addr = addrRes?.address || (addrRes as unknown as string);
          if (!addr || typeof addr !== 'string') {
            throw new Error('Wallet did not return an address');
          }

          console.info('[stellarSession] address from wallet:', addr);
          localStorage.setItem(STORAGE.address, addr);
          console.log('+++ stellar +++', {storageAddress: STORAGE.address, addr});
          useNetworkConfigStore.getState().setWalletAddress(addr);
        },
      });
    } catch (error) {
      console.warn('[stellarSession] connect failed:', (error as Error)?.message || error);

      // Casos típicos: popup bloqueado / postMessage null / timeout
      // Limpia selección para evitar loops en el hydrate
      localStorage.removeItem(STORAGE.walletId);
      // Mantén la UI en estado desconectado
      useNetworkConfigStore.getState().setWalletAddress('');
      alert(
        'No se pudo conectar con el wallet.\n' +
          'Sugerencias:\n' +
          '- Permite popups y vuelve a intentar.\n' +
          '- Si es Albedo y sigue fallando, prueba Freighter o xBull.'
      );
    }
  };

  const logout = async () => {
    try {
      await getStellarWalletsKit()?.disconnect();
    } catch (e) {
      console.warn('[session] disconnect ignore:', e);
    }
    localStorage.removeItem(STORAGE.walletId);
    localStorage.removeItem(STORAGE.address);
    useNetworkConfigStore.getState().setWalletAddress('');
  };

  // Silent restore en montaje
  const hidrate = async () => {
    console.info('[hidrate] hydrate start');
    try {
      const savedWalletId = localStorage.getItem(STORAGE.walletId);
      const savedAddress = localStorage.getItem(STORAGE.address);
      console.info('[hidrate] saved', { savedWalletId, savedAddress });

      if (savedWalletId) {
        try {
          getStellarWalletsKit().setWallet(savedWalletId);
          // Race con timeout para no quedar colgado si la extensión no responde
          const { address } = await withTimeout(getStellarWalletsKit().getAddress(), 4000, 'getAddress(restore)');
          if (address) {
            console.info('[hidrate] restored address:', address);
            localStorage.setItem(STORAGE.address, address);
            useNetworkConfigStore.getState().setWalletAddress(address);
          }
        } catch (e) {
          console.warn('[hidrate] restore failed, clearing cache:', e);
          localStorage.removeItem(STORAGE.walletId);
          // Si teníamos una dirección cacheada, úsala como “mejor esfuerzo”
          if (savedAddress) {
            useNetworkConfigStore.getState().setWalletAddress(savedAddress);
          }
        }
      } else if (savedAddress) {
        // Fallback si solo quedó address
        useNetworkConfigStore.getState().setWalletAddress(savedAddress);
      }
    } catch (e) {
      console.warn('[hidrate] hydrate error:', e);
      localStorage.removeItem(STORAGE.walletId);
      localStorage.removeItem(STORAGE.address);
    } finally {
      console.info('[hidrate] hydrate done');
    }
  };

  return { hidrate, connect, logout };
}
