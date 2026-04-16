import { useAuthStore } from '@/stores/privy';

const noop = async () => {};
export const logoutAll = async () => {
  const { logout, disconnect } = useAuthStore.getState();
  await (logout ?? disconnect ?? noop)();
};
