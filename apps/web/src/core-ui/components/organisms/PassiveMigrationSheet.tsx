'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AMOUNT_DECIMALS, floorAmount, formatUsdAdaptive } from '@/core-ui/helpers/numbers';
import { usePassiveMigration } from '@/core-ui/hooks/usePassiveMigration';
import { AmountKeypad } from '../molecules/AmountKeypad';
import { AppModal } from '../molecules/AppModal';
import { ErrorNotice } from '../molecules/ErrorNotice';
import { PressableButton } from '../molecules/PressableButton';

/**
 * Legacy-Blend migration prompt. Self-derived from the live Blend balance, so it
 * closes on its own once the position is gone and stays resumable if a migration
 * is interrupted. A Blend borrow blocks it until the user repays.
 *
 * Two shapes, because the funds have two very different owners:
 *
 * - Custodial (social login): Vaquita opened that Blend position, so this is a
 *   blocking all-or-nothing prompt — the passive balance moves to the vault or
 *   the app has nothing coherent to show.
 * - External (Freighter/xBull): the user supplied to Blend on their own, so this
 *   is an OFFER. They choose how much to move and can close it. It is derived
 *   from the balance rather than persisted, so it comes back on the next load
 *   while funds remain in Blend.
 */
export function PassiveMigrationSheet({ walletAddress }: { walletAddress?: string }) {
  const { t } = useTranslation();
  const { needsMigration, isExternal, hasBorrow, blendBalance, migrateToVault } = usePassiveMigration(walletAddress);
  const [busy, setBusy] = useState(false);
  // Guardamos el error TAL CUAL: `ErrorNotice` lo humaniza, y aplastarlo a
  // `.message` acá descartaría los errores tipados que ese mapeo reconoce.
  const [error, setError] = useState<unknown>(null);
  const [dismissed, setDismissed] = useState(false);
  const [amount, setAmount] = useState('');

  // Only an offer (external) or a blocked-by-borrow prompt can be closed: a
  // custodial migration has no alternative path, so it stays put.
  const closable = isExternal || hasBorrow;
  const open = needsMigration && !(closable && dismissed);

  // Floor to the token precision so the keypad can never ask for more USDC than
  // the position actually holds.
  const maxAmount = floorAmount(blendBalance, AMOUNT_DECIMALS);
  const numericAmount = Number(amount || '0');
  const amountIsValid = numericAmount > 0 && numericAmount <= maxAmount;

  const run = async (chosen?: number) => {
    setBusy(true);
    setError(null);
    try {
      await migrateToVault(chosen);
      setAmount('');
    } catch (e) {
      setError(e ?? new Error(t('withdraw.error.generic', 'Something went wrong')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={() => closable && setDismissed(true)}
      isDismissable={closable}
      hideClose={!closable}
      title={t('migration.title', 'Move your Blend funds')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-2"
    >
      <p className="text-sm text-gray-700">
        {isExternal
          ? t(
              'migration.bodyExternal',
              'You have {{amount}} in Blend. Move part or all of it into the Vault to earn with Vaquita.',
              {
                amount: formatUsdAdaptive(blendBalance),
              },
            )
          : t('migration.body', 'You have {{amount}} in Blend. To continue you need to move it.', {
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
          <PressableButton variant="white" onClick={() => setDismissed(true)}>
            {t('common.close', 'Close')}
          </PressableButton>
        </>
      ) : isExternal ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-3xl font-bold text-black tabular-nums">${amount === '' ? '0.00' : amount}</span>
            <PressableButton variant="white" size="chip" disabled={busy} onClick={() => setAmount(String(maxAmount))}>
              {t('migration.max', 'Max')}
            </PressableButton>
          </div>

          <AmountKeypad
            value={amount}
            onValueChange={setAmount}
            maxDecimals={AMOUNT_DECIMALS}
            max={maxAmount}
            disabled={busy}
            compact
          />

          <PressableButton variant="success" disabled={busy || !amountIsValid} onClick={() => void run(numericAmount)}>
            {busy ? t('migration.moving', 'Moving…') : t('migration.migrate', 'Move to Vault')}
          </PressableButton>
          <PressableButton variant="white" disabled={busy} onClick={() => setDismissed(true)}>
            {t('migration.notNow', 'Not now')}
          </PressableButton>
        </>
      ) : (
        <PressableButton variant="success" disabled={busy} onClick={() => void run()}>
          {busy ? t('migration.moving', 'Moving…') : t('migration.migrate', 'Move to Vault')}
        </PressableButton>
      )}

      {error ? <ErrorNotice error={error} /> : null}
    </AppModal>
  );
}
