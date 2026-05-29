import { getPrivyData } from './privy';

export const logoutAll = async () => {
  const { logout } = getPrivyData();
  await logout();
};
