'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsdAdaptive } from '@/core-ui/helpers/numbers';
import { usePassiveMigration } from '@/core-ui/hooks/usePassiveMigration';
import { AppModal } from '../molecules/AppModal';
import { PressableButton } from '../molecules/PressableButton';

/**
 * All-or-nothing legacy-Blend migration prompt (spec §6). Auto-opens as a blocking
 * choice whenever the passive-vault flag is on and the user still holds a
 * direct-to-Blend position: move it ALL into the vault, or take it ALL to the
 * wallet — no partial. Self-derived from the live Blend balance, so it closes on
 * its own once the position is gone (and stays resumable if a migration is
 * interrupted). A Blend borrow blocks both branches until it's repaid.
 */
export function PassiveMigrationSheet({ walletAddress }: { walletAddress?: string }) {
  const { t } = useTranslation();
  const { needsMigration, hasBorrow, blendBalance, migrateToVault, withdrawToWallet } =
    usePassiveMigration(walletAddress);
  const [busy, setBusy] = useState<null | 'migrate' | 'withdraw'>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrowDismissed, setBorrowDismissed] = useState(false);

  const open = needsMigration && !(hasBorrow && borrowDismissed);

  const run = async (which: 'migrate' | 'withdraw', fn: () => Promise<void>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={() => {}}
      hideClose
      title={t('migration.title', 'Move your Blend funds')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-2"
    >
      <p className="text-sm text-gray-700">
        {t('migration.body', 'You have {{amount}} in Blend. To continue you need to move it.', {
          amount: formatUsdAdaptive(blendBalance),
        })}
      </p>

      {hasBorrow ? (
        <>
          <p className="text-sm text-warning font-medium">
            {t(
              'migration.borrowBlocked',
              'You have an open Blend borrow against these funds. Repay it first, then you can move them.',
            )}
          </p>
          <PressableButton variant="white" onClick={() => setBorrowDismissed(true)}>
            {t('common.close', 'Close')}
          </PressableButton>
        </>
      ) : (
        <>
          <PressableButton
            variant="success"
            disabled={busy !== null}
            onClick={() => void run('migrate', () => migrateToVault(0))}
          >
            {busy === 'migrate'
              ? t('migration.moving', 'Moving…')
              : t('migration.migrate', 'Move to Vault')}
          </PressableButton>
          <PressableButton
            variant="white"
            disabled={busy !== null}
            onClick={() => void run('withdraw', withdrawToWallet)}
          >
            {busy === 'withdraw'
              ? t('migration.withdrawing', 'Withdrawing…')
              : t('migration.withdraw', 'Withdraw to wallet')}
          </PressableButton>
        </>
      )}

      {error && <p className="text-sm text-error">{error}</p>}
    </AppModal>
  );
}
