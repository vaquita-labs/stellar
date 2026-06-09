'use client';

import { useConfigStore } from '@/core-ui/stores';
import { useQueryClient } from '@tanstack/react-query';
import type * as Ably from 'ably';
import { useChannel } from 'ably/react';

/**
 * Refetches the notifications feed whenever a `change` event for this wallet
 * arrives on the `notifications-changes` Ably channel (the bell badge and the
 * /notifications list update live). Must be rendered inside the matching
 * `ChannelProvider` and a `QueryClientProvider`.
 */
export function ListenNotificationsChanges() {
  const queryClient = useQueryClient();
  const { walletAddress } = useConfigStore();

  const handleChange = (message: Ably.Message) => {
    const target = (message.data as { walletAddress?: string } | undefined)?.walletAddress;
    if (!walletAddress || (target && target !== walletAddress)) {
      return;
    }
    return queryClient.invalidateQueries({ queryKey: ['notifications', walletAddress] });
  };

  useChannel('notifications-changes', 'change', handleChange);
  return null;
}
