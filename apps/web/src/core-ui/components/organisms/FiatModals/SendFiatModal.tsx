'use client';

import { ASSETS } from '@/networks/anclap/anclap';
import { AnclapError, useAnclap } from '@/networks/anclap/useAnclap';
import { Button, Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { truncateDecimals } from '../../../helpers';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { MoneyInput } from '../../molecules/MoneyInput/MoneyInput';
import { TokenSymbol } from '../../molecules/MoneyInput/types';
import { FiatAuthBadge } from './FiatAuthBadge';
import { FiatStepList, StepStatus } from './FiatStepList';

interface SendFiatModalProps {
  open: boolean;
  onOpenChange: () => void;
}

type StepKey = 'trustline' | 'swap' | 'challenge' | 'sign' | 'token' | 'withdraw';

// El swap (USDC->ARS) y el retiro SEP-24 se cablean en el siguiente incremento;
// por ahora quedan marcados como `pending` para mostrar el flujo completo.
const IMPLEMENTED: StepKey[] = ['trustline', 'challenge', 'sign', 'token'];

const ARS = 'ARS';

export function SendFiatModal({ open, onOpenChange }: SendFiatModalProps) {
  const { t } = useTranslation();
  const { token, setToken } = useConfigStore();
  const { walletAddress, walletBalance, refreshWalletBalance, refreshAssets, walletType, login } = usePollar();
  const { authenticate, ensureTrustline } = useAnclap();

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>({
    trustline: 'idle',
    swap: 'pending',
    challenge: 'idle',
    sign: 'idle',
    token: 'idle',
    withdraw: 'pending',
  });
  const [error, setError] = useState<string | null>(null);
  const [showReconnect, setShowReconnect] = useState(false);
  const [jwt, setJwt] = useState<string | null>(null);

  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  const usdcBalance = balances.find((b) => b.type !== 'native' && b.code?.toUpperCase() === 'USDC');
  const balanceFormatted = usdcBalance ? truncateDecimals(Number(usdcBalance.available), 5) : 0;
  const balanceIsLoading = walletBalance.step === 'loading';

  const amountNum = Number(amount);
  const overBalance = amountNum > Number(balanceFormatted);
  const isDisabled = !amount || amountNum <= 0 || Number.isNaN(amountNum) || overBalance || !walletAddress;

  useEffect(() => {
    if (open && walletAddress) void refreshWalletBalance();
  }, [open, walletAddress, refreshWalletBalance]);

  // Reset al cerrar para que un nuevo envío arranque limpio.
  useEffect(() => {
    if (!open) {
      setAmount('');
      setError(null);
      setShowReconnect(false);
      setJwt(null);
      setSteps({
        trustline: 'idle',
        swap: 'pending',
        challenge: 'idle',
        sign: 'idle',
        token: 'idle',
        withdraw: 'pending',
      });
    }
  }, [open]);

  const mark = (key: StepKey, status: StepStatus) => setSteps((prev) => ({ ...prev, [key]: status }));

  const handleSend = async () => {
    if (isDisabled || !walletAddress) return;
    setBusy(true);
    setError(null);
    setShowReconnect(false);
    setJwt(null);

    try {
      // 1) Trustline ARS (necesaria para recibir el swap y operar el retiro).
      mark('trustline', 'running');
      await ensureTrustline(walletAddress, ARS, ASSETS[ARS].issuer);
      await refreshAssets();
      mark('trustline', 'done');

      // 2) SEP-10: challenge -> firmar (wallet) -> JWT.
      const map: Record<'challenge' | 'sign' | 'token', StepKey> = {
        challenge: 'challenge',
        sign: 'sign',
        token: 'token',
      };
      const jwtToken = await authenticate(walletAddress, (sub) => {
        mark(map[sub], 'running');
        // El subpaso anterior queda en done cuando arranca el siguiente.
        if (sub === 'sign') mark('challenge', 'done');
        if (sub === 'token') mark('sign', 'done');
      });
      mark('token', 'done');
      setJwt(jwtToken);
      toast.success(t('wallet.fiat.send.authOk', 'Authenticated with Anclap (JWT obtained).'));
    } catch (e) {
      const msg = e instanceof AnclapError || e instanceof Error ? e.message : String(e);
      setError(msg);
      // Marca el paso en curso como error.
      setSteps((prev) => {
        const next = { ...prev };
        (Object.keys(next) as StepKey[]).forEach((k) => {
          if (next[k] === 'running') next[k] = 'error';
        });
        return next;
      });
      // Wallet externa que perdió la autorización del origen -> ofrecer reconectar.
      if (walletType) setShowReconnect(true);
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = () => {
    if (!walletType) return;
    setError(null);
    setShowReconnect(false);
    login({ provider: 'wallet', type: walletType });
  };

  const stepLabels: Record<StepKey, string> = {
    trustline: t('wallet.fiat.send.stepTrustline', 'Activate ARS trustline'),
    swap: t('wallet.fiat.send.stepSwap', 'Swap USDC → ARS'),
    challenge: t('wallet.fiat.send.stepChallenge', 'SEP-10 · Request challenge'),
    sign: t('wallet.fiat.send.stepSign', 'SEP-10 · Sign (wallet)'),
    token: t('wallet.fiat.send.stepToken', 'SEP-10 · Get Anclap JWT'),
    withdraw: t('wallet.fiat.send.stepWithdraw', 'SEP-24 · Start withdrawal'),
  };
  const order: StepKey[] = ['swap', 'trustline', 'challenge', 'sign', 'token', 'withdraw'];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!busy}
      title={t('wallet.fiat.send.title', 'Send fiat (ARS)')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={
        showReconnect ? (
          <Button
            onPress={handleReconnect}
            className="w-full border px-4 py-6 bg-primary border-black border-b-5 font-bold rounded-md text-black"
          >
            {t('wallet.fiat.send.reconnect', 'Reconnect wallet')}
          </Button>
        ) : (
          <Button
            onPress={handleSend}
            isDisabled={isDisabled || busy}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
          >
            {busy ? (
              <>
                <Spinner size="sm" color="current" /> {t('wallet.fiat.send.processing', 'Processing…')}
              </>
            ) : (
              t('wallet.fiat.send.cta', 'Send')
            )}
          </Button>
        )
      }
    >
      <MoneyInput
        balanceFormatted={balanceFormatted.toString()}
        tokenSymbol={token?.symbol as TokenSymbol}
        value={amount}
        onValueChange={(v) => setAmount(v)}
        onTokenChange={(t) => setToken(t)}
        onReloadBalance={refreshWalletBalance}
        loading={busy}
        balanceIsLoading={balanceIsLoading}
      />

      {overBalance && <p className="text-danger text-xs -mt-2">{t('wallet.fiat.send.insufficient', 'Insufficient USDC balance.')}</p>}

      {/* Stepper del flujo off-ramp. */}
      <FiatStepList
        steps={order.map((key) => ({
          key,
          label: stepLabels[key],
          status: steps[key],
          implemented: IMPLEMENTED.includes(key),
        }))}
      />

      {jwt && <FiatAuthBadge jwt={jwt} />}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </AppModal>
  );
}
