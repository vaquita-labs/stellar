'use client';

import { useQueryClient } from '@tanstack/react-query';
import type * as Ably from 'ably';
import { useChannel } from 'ably/react';

/**
 * Invalidates the `deposit` queries whenever a `change` event arrives on the
 * `deposits-changes` Ably channel. Must be rendered inside the matching
 * `ChannelProvider` and a `QueryClientProvider`.
 */
export function ListenDepositsChanges() {
  const queryClient = useQueryClient();
  const handleChange = (message: Ably.Message) => {
    console.info('handleChange', message);
    return queryClient.invalidateQueries({ queryKey: ['deposit'], exact: false });
  };
  useChannel('deposits-changes', 'change', handleChange);
  return null;
}
