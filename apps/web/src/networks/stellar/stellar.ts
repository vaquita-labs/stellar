import { useNetworkConfigStore } from '../../core-ui/stores';
import { pollarAdapter } from './wallet/adapters/pollar-adapter';
import { setActiveAdapter } from './wallet/registry';

export function stellarSession() {
  const logout = async () => {
    try {
      await pollarAdapter.disconnect();
    } catch (e) {
      console.warn('[stellarSession] disconnect ignore:', e);
    }
    setActiveAdapter(null);
    useNetworkConfigStore.getState().setWalletAddress('');
  };

  // Pollar hydration is driven by PollarBridge subscribing to PollarProvider
  // state, so there is nothing for this session helper to restore.
  const hidrate = async () => {};

  return { hidrate, logout };
}
