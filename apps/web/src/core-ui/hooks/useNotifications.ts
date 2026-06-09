'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson, postJson } from '../api/http';
import { useConfigStore } from '../stores';

export type NotificationType = 'deposit' | 'reward' | 'streak' | 'friend' | 'system';

/**
 * One row of the notifications feed (mirrors the API's NotificationDTO).
 * `messageKey` + `params` map to `notificationsCenter.messages.<key>.{title,body}`
 * i18n entries; `link` is the in-app route opened on tap ('' = not clickable).
 */
export type AppNotification = {
  id: string;
  type: NotificationType;
  messageKey: string;
  params: Record<string, string | number>;
  link: string;
  read: boolean;
  /** epoch ms */
  createdAt: number;
};

export type NotificationsResponseDTO = {
  networkName: string;
  walletAddress: string;
  notifications: AppNotification[];
  unread: number;
};

const notificationsQueryKey = (walletAddress: string | null | undefined) => ['notifications', walletAddress];

export const useNotifications = () => {
  const { walletAddress } = useConfigStore();
  return useQuery<NotificationsResponseDTO | null>({
    queryKey: notificationsQueryKey(walletAddress),
    queryFn: () => getJson<NotificationsResponseDTO>(`/notifications/wallet/${walletAddress}`),
    enabled: !!walletAddress,
  });
};

/** Unread count for the header bell badge. */
export const useUnreadNotificationsCount = (): number => useNotifications().data?.unread ?? 0;

/** Optimistically flips rows to read in the cache, then syncs with the server. */
const useReadMutation = (
  mutationFn: (id: string) => Promise<unknown>,
  apply: (data: NotificationsResponseDTO, id: string) => NotificationsResponseDTO,
) => {
  const queryClient = useQueryClient();
  const { walletAddress } = useConfigStore();
  const queryKey = notificationsQueryKey(walletAddress);

  return useMutation({
    mutationFn,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<NotificationsResponseDTO | null>(queryKey, (prev) =>
        prev ? apply(prev, id) : prev,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
};

export const useMarkNotificationRead = () => {
  const { walletAddress } = useConfigStore();
  return useReadMutation(
    (id) => postJson(`/notifications/wallet/${walletAddress}/read`, { id }),
    (data, id) => ({
      ...data,
      unread: Math.max(0, data.unread - (data.notifications.some((n) => n.id === id && !n.read) ? 1 : 0)),
      notifications: data.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }),
  );
};

export const useMarkAllNotificationsRead = () => {
  const { walletAddress } = useConfigStore();
  return useReadMutation(
    () => postJson(`/notifications/wallet/${walletAddress}/read-all`),
    (data) => ({
      ...data,
      unread: 0,
      notifications: data.notifications.map((n) => ({ ...n, read: true })),
    }),
  );
};
