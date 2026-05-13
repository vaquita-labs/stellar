import { useNetworkConfigStore } from '../../core-ui/stores';
import { stellarWalletsKitAdapter } from './wallet/adapters/stellar-wallets-kit-adapter';
import { getActiveAdapter, getStoredAdapterId, setActiveAdapter } from './wallet/registry';
import type { WalletAdapter } from './wallet/types';

export function stellarSession() {
  const useAdapter = (): WalletAdapter => {
    const active = getActiveAdapter();
    if (active) return active;
    // Default fallback: Stellar Wallets Kit
    setActiveAdapter(stellarWalletsKitAdapter);
    return stellarWalletsKitAdapter;
  };

  const connect = async () => {
    try {
      // The Stellar Wallets Kit modal-driven connect:
      // explicitly set it as active before opening so the address it returns
      // is wired to the kit adapter (even if some other adapter was previously active).
      setActiveAdapter(stellarWalletsKitAdapter);
      const result = await stellarWalletsKitAdapter.connect();
      if (result?.address) {
        useNetworkConfigStore.getState().setWalletAddress(result.address);
      }
    } catch (error) {
      console.warn('[stellarSession] connect failed:', (error as Error)?.message || error);
      useNetworkConfigStore.getState().setWalletAddress('');
      alert(
        'No se pudo conectar con el wallet.\n' +
          'Sugerencias:\n' +
          '- Permite popups y vuelve a intentar.\n' +
          '- Si es Albedo y sigue fallando, prueba Freighter o xBull.',
      );
    }
  };

  const logout = async () => {
    const active = getActiveAdapter();
    try {
      if (active) await active.disconnect();
    } catch (e) {
      console.warn('[stellarSession] disconnect ignore:', e);
    }
    setActiveAdapter(null);
    useNetworkConfigStore.getState().setWalletAddress('');
  };

  const hidrate = async () => {
    console.info('[hidrate] hydrate start');
    try {
      const storedId = getStoredAdapterId();
      // Only the Stellar Wallets Kit can be hydrated synchronously here.
      // Pollar hydration is driven by PollarBridge subscribing to PollarProvider state.
      if (storedId === 'pollar') {
        console.info('[hidrate] pollar adapter pending bridge hydration');
        return;
      }
      // Default: try kit
      const adapter = useAdapter();
      const address = await adapter.hydrate();
      if (address) {
        console.info('[hidrate] restored address:', address);
        useNetworkConfigStore.getState().setWalletAddress(address);
      }
    } catch (e) {
      console.warn('[hidrate] hydrate error:', e);
    } finally {
      console.info('[hidrate] hydrate done');
    }
  };

  return { hidrate, connect, logout };
}
