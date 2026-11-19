'use client';

import { usePollar } from '@pollar/react';
import { useEffect } from 'react';
import { ConfirmSheet } from './ConfirmSheet';

/**
 * Whether a confirmation has to be shown to the user, or is answered yes for
 * them.
 *
 * Every signature in Vaquita starts from a button in Vaquita's own flow
 * (deposit, withdraw, send, claim a badge, invest idle money), where the user
 * has already seen the amount and pressed the button. Asking again in a second
 * sheet says nothing new, so those are answered at once.
 *
 * A ramp leg is the exception: the SDK asks for it whatever the app's policy,
 * and it keeps its sheet. `_rampSigning` is the SDK's own counter of ramp legs
 * being signed; it is not public, so anything other than a number shows the
 * sheet rather than signing unasked.
 */
export function confirmationNeedsSheet(rampSigning: unknown): boolean {
  return typeof rampSigning !== 'number' || rampSigning > 0;
}

/**
 * Answers the transaction confirmations the SDK waits on. A signing call does
 * not go on until one is answered, and the SDK's own prompt is hidden (see
 * globals.css), so this is what answers it: at once for the app's own flows,
 * through Vaquita's sheet for a ramp leg.
 */
export function ConfirmHost() {
  const { confirmations, getClient } = usePollar();
  const needsSheet =
    confirmations.length > 0 &&
    confirmationNeedsSheet((getClient() as unknown as { _rampSigning?: unknown })._rampSigning);

  useEffect(() => {
    if (needsSheet) return;
    for (const confirmation of confirmations) confirmation.confirm();
  }, [confirmations, needsSheet]);

  return <ConfirmSheet confirmation={needsSheet ? (confirmations[0] ?? null) : null} />;
}
