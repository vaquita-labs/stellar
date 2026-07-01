'use client';

import { ASSETS } from '@/networks/anclap/anclap';
import { useAnclapAuthStore } from '@/networks/anclap/anclapAuth';
import { AnclapCancelled, AnclapError, assetParam, useAnclap } from '@/networks/anclap/useAnclap';
import { Button, Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiExternalLink } from 'react-icons/fi';
import { truncateDecimals } from '../../../helpers';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { MoneyInput } from '../../molecules/MoneyInput/MoneyInput';
import { TokenSymbol } from '../../molecules/MoneyInput/types';
import { FiatAuthBadge } from './FiatAuthBadge';
import { FiatStepList, StepStatus } from './FiatStepList';
import { FiatTxHistory } from './FiatTxHistory';

interface SendFiatModalProps {
  open: boolean;
  onOpenChange: () => void;
}

type StepKey = 'trustline' | 'swap' | 'challenge' | 'sign' | 'token' | 'withdraw' | 'settled';

const IMPLEMENTED: StepKey[] = ['trustline', 'swap', 'challenge', 'sign', 'token', 'withdraw', 'settled'];

const ARS = 'ARS';
const USDC = 'USDC';
const MIN_USDC = 0.1;

const INITIAL_STEPS: Record<StepKey, StepStatus> = {
  trustline: 'idle',
  swap: 'idle',
  challenge: 'idle',
  sign: 'idle',
  token: 'idle',
  withdraw: 'idle',
  settled: 'idle',
};

export function SendFiatModal({ open, onOpenChange }: SendFiatModalProps) {
  const { t } = useTranslation();
  const { token, setToken } = useConfigStore();
  const { walletAddress, walletBalance, refreshWalletBalance, refreshAssets, walletType, login } = usePollar();
  const { authenticate, ensureTrustline, swap, startInteractive, waitForCompletion } = useAnclap();
  const setSharedJwt = useAnclapAuthStore((s) => s.setJwt);

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [waitStatus, setWaitStatus] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [showReconnect, setShowReconnect] = useState(false);
  const [jwt, setJwt] = useState<string | null>(null);
  const [arsReceived, setArsReceived] = useState<string | null>(null);
  const [interactiveUrl, setInteractiveUrl] = useState<string | null>(null);

  // Ref espejo de `open` para abortar el polling si el usuario cierra el modal.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  const usdcBalance = balances.find((b) => b.type !== 'native' && b.code?.toUpperCase() === 'USDC');
  const balanceFormatted = usdcBalance ? truncateDecimals(Number(usdcBalance.available), 5) : 0;
  const balanceIsLoading = walletBalance.step === 'loading';

  const amountNum = Number(amount);
  const overBalance = amountNum > Number(balanceFormatted);
  const belowMin = amountNum < MIN_USDC;
  const isDisabled = !amount || Number.isNaN(amountNum) || belowMin || overBalance || !walletAddress;

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
      setArsReceived(null);
      setInteractiveUrl(null);
      setWaiting(false);
      setWaitStatus(null);
      setSteps(INITIAL_STEPS);
    }
  }, [open]);

  const mark = (key: StepKey, status: StepStatus) => setSteps((prev) => ({ ...prev, [key]: status }));

  const handleSend = async () => {
    if (isDisabled || !walletAddress) return;
    setBusy(true);
    setError(null);
    setShowReconnect(false);
    setJwt(null);
    setArsReceived(null);
    setInteractiveUrl(null);
    setWaitStatus(null);

    try {
      // 1) Trustline ARS (necesaria para recibir el swap y operar el retiro).
      mark('trustline', 'running');
      await ensureTrustline(walletAddress, ARS, ASSETS[ARS].issuer);
      await refreshAssets();
      mark('trustline', 'done');

      // 2) Swap USDC -> ARS con el monto ingresado.
      mark('swap', 'running');
      const { quotedOut: arsAmount } = await swap({
        account: walletAddress,
        send: assetParam(USDC, ASSETS[USDC].issuer),
        sendAmount: amount,
        dest: assetParam(ARS, ASSETS[ARS].issuer),
      });
      setArsReceived(arsAmount);
      mark('swap', 'done');

      // 3) SEP-10: challenge -> firmar (wallet) -> JWT.
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
      setSharedJwt(jwtToken);

      // 4) SEP-24: iniciar retiro de los ARS y abrir Anclap en otra pestaña.
      mark('withdraw', 'running');
      const { id, url } = await startInteractive('withdraw', jwtToken, {
        asset_code: ARS,
        account: walletAddress,
        amount: arsAmount,
      });
      setInteractiveUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      mark('withdraw', 'done');
      toast.success(t('wallet.fiat.send.withdrawStarted', 'Withdrawal started — continue on Anclap.'));

      // 5) Esperar a que Anclap marque el retiro como completado.
      mark('settled', 'running');
      setWaiting(true);
      await waitForCompletion(id, jwtToken, {
        shouldStop: () => !openRef.current,
        onStatus: (status) => setWaitStatus(status ?? null),
      });
      setWaiting(false);
      mark('settled', 'done');
      toast.success(t('wallet.fiat.send.settled', 'Withdrawal completed on Anclap.'));
    } catch (e) {
      // Cancelación (el usuario cerró el modal durante la espera): no es error.
      if (e instanceof AnclapCancelled) return;
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
      setWaiting(false);
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
    settled: t('wallet.fiat.send.stepSettled', 'Wait for Anclap confirmation'),
  };
  const order: StepKey[] = ['trustline', 'swap', 'challenge', 'sign', 'token', 'withdraw', 'settled'];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      // Durante la espera de confirmación dejamos cerrar (puede tardar); el
      // polling se aborta solo. En los pasos rápidos (firmas) bloqueamos.
      isDismissable={!busy || waiting}
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
        min={MIN_USDC}
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

      {arsReceived && (
        <p className="text-sm font-semibold text-success">
          {t('wallet.fiat.send.arsReceived', '≈ {{amount}} ARS swapped', { amount: arsReceived })}
        </p>
      )}

      {waiting && (
        <p className="text-xs text-gray-500">
          {t('wallet.fiat.send.waitingHint', 'Complete the withdrawal on Anclap. We are waiting for the confirmation…')}
          {waitStatus ? ` (${waitStatus})` : ''}
        </p>
      )}

      {jwt && <FiatAuthBadge jwt={jwt} />}
      {interactiveUrl && (
        <a
          href={interactiveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#c4ecff]"
        >
          <FiExternalLink className="h-4 w-4" />
          {t('wallet.fiat.send.openAnclap', 'Open Anclap')}
        </a>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <FiatTxHistory assetCode={ARS} kind="withdrawal" jwt={jwt} />
    </AppModal>
  );
}
