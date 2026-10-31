'use client';

import { usePollar } from '@pollar/react';
import { useEffect } from 'react';
import { useWalletRecoveryStore } from '../../../stores';
import { WalletRecoveryModal } from './WalletRecoveryModal';

/**
 * Mounts Vaquita's recovery screen and opens it when the SDK would have opened
 * its own: a co-signed signature from a device that is not one of the wallet's
 * credentials, or one the server refuses until the wallet can be recovered.
 * The other opener is the custody migration, once the wallets moved (see
 * `CustodyMigrationGate`).
 */
export function WalletRecoveryHost() {
  const { getClient } = usePollar();
  const open = useWalletRecoveryStore((s) => s.open);
  const openWalletRecovery = useWalletRecoveryStore((s) => s.openWalletRecovery);
  const closeWalletRecovery = useWalletRecoveryStore((s) => s.closeWalletRecovery);

  // Two SDK signals open the sheet. A device that is not one of the wallet's
  // credentials, and a signature the server refused because the wallet has no
  // way to be recovered yet (409 SDK_WALLET_RECOVERY_REQUIRED). The SDK would
  // open its own recovery modal on both; that one is hidden (see globals.css),
  // so without this the user would see a spinner and nothing else.
  useEffect(() => {
    const client = getClient();
    const offEnrolled = client.onCosignDeviceNotEnrolled(openWalletRecovery);
    const offRecovery = client.onWalletRecoveryRequired(openWalletRecovery);
    return () => {
      offEnrolled();
      offRecovery();
    };
  }, [getClient, openWalletRecovery]);

  return <WalletRecoveryModal open={open} onClose={closeWalletRecovery} />;
}
