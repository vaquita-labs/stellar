import { usePrivyStore } from '@/stores';

export function getPrivyData() {
  const { ready, authenticated, wallets, logout } = usePrivyStore.getState();
  return { ready, authenticated, wallets, logout };
}
