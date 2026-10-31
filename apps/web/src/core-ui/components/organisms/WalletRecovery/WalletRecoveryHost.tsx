'use client';

import { usePollar } from '@pollar/react';
import { useEffect } from 'react';
import { useWalletRecoveryStore } from '../../../stores';
import { WalletRecoveryModal } from './WalletRecoveryModal';

/**
 * Mounts Vaquita's recovery screen and opens it when the SDK would have opened
 * its own: a co-signed signature from a device that is not one of the wallet's
 * credentials stops and asks the user to get back in. The other opener is the
 * custody migration, once the wallets moved (see `CustodyMigrationGate`).
 */
export function WalletRecoveryHost() {
  const { getClient } = usePollar();
  const open = useWalletRecoveryStore((s) => s.open);
  const openWalletRecovery = useWalletRecoveryStore((s) => s.openWalletRecovery);
  const closeWalletRecovery = useWalletRecoveryStore((s) => s.closeWalletRecovery);

  useEffect(() => getClient().onCosignDeviceNotEnrolled(openWalletRecovery), [getClient, openWalletRecovery]);

  return <WalletRecoveryModal open={open} onClose={closeWalletRecovery} />;
}
