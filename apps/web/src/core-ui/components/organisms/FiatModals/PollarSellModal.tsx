'use client';

import { awaitUsdcCredit, readUsdcBalance } from '@/networks/stellar/blendDirect';
import { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import { payableAmount, withdrawRequestAmount } from '@/networks/stellar/withdrawAmounts';
import { Spinner } from '@heroui/react';
import { RampWidget, usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AMOUNT_DECIMALS, floorAmount, formatTokenPrecise, MIN_USDC, MONEY_INPUT_DECIMALS } from '../../../helpers/numbers';
import { humanizeTxError } from '../../../helpers/txError';
import { useAnalytics, useInvalidateAfterMoneyMove, useLivePassiveUsdc, usePositionsChip } from '../../../hooks';
import { useConfigStore, useRampActiveStore } from '../../../stores';
import { AmountStep } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface PollarSellModalProps {
  open: boolean;
  /** ISO 3166-1 alpha-2 country picked in the app's selector. */
  country: string;
  onOpenChange: () => void;
  onBack?: () => void;
}

/**
 * Selling for local currency through Pollar's RampWidget, out of savings.
 *
 * The widget sells from the wallet, but the user's USDC sits in the vault. So the
 * amount is chosen here, only that much is withdrawn to the wallet, and the widget
 * opens on the figure that landed. The rest keeps earning.
 *
 * The widget is mounted here rather than through `openRampModal` because that one
 * has no close callback, and closing is what releases the withdrawn USDC back to
 * the idle-funds prompt.
 */
export function PollarSellModal({ open, country, onOpenChange, onBack }: PollarSellModalProps) {
  const { t } = useTranslation();
  const { token } = useConfigStore();
  const { wallet, refreshWalletBalance } = usePollar();
  const walletAddress = wallet?.address ?? null;
  const { trackUserAction, trackError } = useAnalytics();
  const invalidateAfterMoneyMove = useInvalidateAfterMoneyMove();
  const setRampActive = useRampActiveStore((s) => s.setRampActive);

  const { live, isLoading, refetch } = useLivePassiveUsdc(walletAddress ?? undefined);
  const positionsChip = usePositionsChip();
  const available = floorAmount(live, AMOUNT_DECIMALS);

  const [stage, setStage] = useState<'amount' | 'widget'>('amount');
  const [amount, setAmount] = useState('');
  /** The whole balance, when the amount came from the Max chip; on screen it is rounded to the cent. */
  const [maxExact, setMaxExact] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the withdrawal credited, for the widget to open on. Unset when it could not be read. */
  const [widgetAmount, setWidgetAmount] = useState<string | null>(null);

  const sendAmount = maxExact ?? amount;
  const amountNum = Number(sendAmount);
  const overBalance = amountNum > available;
  const belowMin = amountNum < MIN_USDC;
  const isDisabled = !amount || Number.isNaN(amountNum) || belowMin || overBalance || !walletAddress || !token;

  useEffect(() => {
    if (open && walletAddress) void refetch();
  }, [open, walletAddress, refetch]);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setStage('amount');
      setAmount('');
      setMaxExact(null);
      setBusy(false);
      setError(null);
      setWidgetAmount(null);
    }
  }

  // Closing, from either screen, hands whatever the sale left in the wallet back
  // to the idle-funds prompt, with a fresh balance so it offers it right away.
  useEffect(() => {
    if (open) return;
    setRampActive(false);
    void refreshWalletBalance();
  }, [open, setRampActive, refreshWalletBalance]);

  useEffect(() => () => setRampActive(false), [setRampActive]);

  const handleContinue = async () => {
    if (isDisabled || !walletAddress || !token) return;
    setBusy(true);
    setError(null);
    // The USDC about to land in the wallet is on its way to the sale. Without the
    // mark the idle-funds prompt reads it as new money and offers to send it
    // straight back to the vault.
    setRampActive(true);

    const withdrawAll = amountNum >= available;
    let hash: string;
    let balanceBefore: number;
    try {
      balanceBefore = await readUsdcBalance(walletAddress, token.decimals);
      ({ hash } = await passiveWithdraw({
        address: walletAddress,
        amount: withdrawRequestAmount(sendAmount, token.decimals, { hasPaymentLeg: !withdrawAll }),
        decimals: token.decimals,
        withdrawAll,
        flowKind: 'external_out',
      }));
    } catch (e) {
      setRampActive(false);
      setError(humanizeTxError(e, t).title);
      setBusy(false);
      return;
    }

    void invalidateAfterMoneyMove().catch(() => {});
    trackUserAction('withdraw_offramp_funded', { amount: sendAmount, country });

    let credited: string | null = null;
    try {
      const creditedBase = await awaitUsdcCredit(walletAddress, token.decimals, balanceBefore, { hash });
      credited = payableAmount(creditedBase, sendAmount, token.decimals, { withdrawAll });
    } catch (e) {
      // The withdrawal settled, so the money is in the wallet either way. The
      // widget still opens, without a figure, and its Max reads the wallet.
      trackError(e instanceof Error ? e.message : String(e), {
        context: 'pollar_sell_credit',
        withdrawHash: hash,
        requested: sendAmount,
      });
    }

    setWidgetAmount(credited);
    setStage('widget');
    setBusy(false);
  };

  return (
    <>
      <AppModal
        open={open && stage === 'amount'}
        onOpenChange={onOpenChange}
        {...(onBack && !busy ? { onBack } : {})}
        // A money sheet: it cannot be closed while the withdrawal is in flight.
        isDismissable={false}
        hideClose={busy}
        title={t('wallet.fiat.pollarSell.title', 'Withdraw to your bank')}
        size="md"
        bodyClassName="flex flex-col gap-4 pb-6"
        footer={
          <PressableButton variant="success" size="cta" onClick={handleContinue} disabled={isDisabled || busy}>
            {busy ? (
              <>
                <Spinner size="sm" color="current" /> {t('wallet.fiat.pollarSell.moving', 'Moving it out of your savings…')}
              </>
            ) : (
              t('wallet.fiat.pollarSell.cta', 'Continue')
            )}
          </PressableButton>
        }
      >
        <p className="text-sm text-gray-600">
          {t(
            'wallet.fiat.pollarSell.hint',
            'First we move this amount from your savings to your wallet. Then you choose how to receive it.',
          )}
        </p>
        <AmountStep
          value={amount}
          onValueChange={(next) => {
            setAmount(next);
            setMaxExact(null);
          }}
          decimals={MONEY_INPUT_DECIMALS}
          disabled={busy}
          available={available}
          availableDecimals={2}
          onMax={setMaxExact}
          positions={positionsChip}
          availableLoading={isLoading}
          error={overBalance ? t('wallet.fiat.send.insufficient', 'Insufficient USDC balance.') : error}
          hint={t('withdraw.minWithdraw', 'Minimum withdrawal: {{amount}} USDC.', {
            amount: formatTokenPrecise(MIN_USDC, 2),
          })}
        />
      </AppModal>
      {open &&
        stage === 'widget' &&
        createPortal(
          <RampWidget
            onClose={onOpenChange}
            initial={{ direction: 'sell', country, asset: 'USDC', ...(widgetAmount ? { amount: widgetAmount } : {}) }}
          />,
          document.body,
        )}
    </>
  );
}
