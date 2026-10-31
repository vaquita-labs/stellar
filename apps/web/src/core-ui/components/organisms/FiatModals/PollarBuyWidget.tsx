'use client';

import { RampWidget, usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePendingCreditStore, useRampActiveStore } from '../../../stores';

interface PollarBuyWidgetProps {
  /** ISO 3166-1 alpha-2 country picked in the app's selector. */
  country: string;
  onClose: () => void;
}

/**
 * Buying USDC through Pollar's RampWidget, wired to the idle-funds prompt so what
 * the user bought is offered for savings as soon as it lands.
 *
 * While the widget is up the prompt is held back, so a purchase that settles
 * mid-flow does not cover it. On close, an order still in flight starts the
 * pending-credit window: the header blinks and the wallet is re-read until the
 * USDC lands, which is what opens the prompt. A settled one is already in the
 * wallet and only needs the fresh balance.
 *
 * Mounted here rather than through `openRampModal` because that one has no close
 * callback.
 */
export function PollarBuyWidget({ country, onClose }: PollarBuyWidgetProps) {
  const { getClient, refreshWalletBalance } = usePollar();
  const setRampActive = useRampActiveStore((s) => s.setRampActive);
  const startPendingCredit = usePendingCreditStore((s) => s.startPendingCredit);
  // Orders created before the widget opened are not this purchase.
  const [openedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    setRampActive(true);
    return () => setRampActive(false);
  }, [setRampActive]);

  const handleClose = () => {
    onClose();
    setRampActive(false);
    void refreshWalletBalance();
    void getClient()
      .listRampOrders({ open: 'true', since: openedAt })
      .then(({ orders }) => {
        if (orders.some((order) => order.direction === 'ONRAMP')) startPendingCredit();
      })
      .catch(() => {
        // Without the list the purchase is still picked up, only later: on the
        // next balance read rather than the five-second poll.
      });
  };

  return createPortal(
    <RampWidget onClose={handleClose} initial={{ direction: 'buy', country, asset: 'USDC' }} />,
    document.body,
  );
}
