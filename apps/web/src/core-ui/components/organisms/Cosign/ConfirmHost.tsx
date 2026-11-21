'use client';

import { usePollar } from '@pollar/react';
import { ConfirmSheet } from './ConfirmSheet';

/**
 * Shows the first transaction confirmation the SDK is waiting on, one at a
 * time, in Vaquita's own sheet. A signing call does not go on until the user
 * answers; with the SDK's prompt hidden, this is what answers it.
 */
export function ConfirmHost() {
  const { confirmations } = usePollar();
  return <ConfirmSheet confirmation={confirmations[0] ?? null} />;
}
