'use client';

import { ASSETS } from '@/networks/anclap/anclap';
import { useAnclapAuthStore } from '@/networks/anclap/anclapAuth';
import { AnclapCancelled, AnclapError, assetParam, SepTransaction, useAnclap } from '@/networks/anclap/useAnclap';
import { Button, Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiExternalLink } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { FiatAuthBadge } from './FiatAuthBadge';
import { FiatStepList, StepStatus } from './FiatStepList';
import { FiatTxHistory } from './FiatTxHistory';

interface ReceiveFiatModalProps {
  open: boolean;
  onOpenChange: () => void;
}

type StepKey = 'trustline' | 'challenge' | 'sign' | 'token' | 'deposit' | 'credit' | 'swap';

const IMPLEMENTED: StepKey[] = ['trustline', 'challenge', 'sign', 'token', 'deposit', 'credit', 'swap'];

const ARS = 'ARS';
const USDC = 'USDC';

// Estados terminales de una tx SEP-24 (no hay nada que reanudar).
const FAILED = new Set(['error', 'refunded', 'expired', 'no_market', 'too_small', 'too_large']);

const INITIAL_STEPS: Record<StepKey, StepStatus> = {
  trustline: 'idle',
  challenge: 'idle',
  sign: 'idle',
  token: 'idle',
  deposit: 'idle',
  credit: 'idle',
  swap: 'idle',
};

/**
 * On-ramp completo (recibir fiat ARS): trustline -> SEP-10 -> SEP-24 deposit
 * interactivo -> espera la acreditación de ARS (polling de la tx) -> swap
 * ARS -> USDC. Cada paso se marca a medida que avanza.
 */
export function ReceiveFiatModal({ open, onOpenChange }: ReceiveFiatModalProps) {
  const { t } = useTranslation();
  const { walletAddress, refreshAssets, walletType, login } = usePollar();
  const { authenticate, ensureTrustline, startInteractive, waitForCompletion, swap } = useAnclap();
  const setSharedJwt = useAnclapAuthStore((s) => s.setJwt);

  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [waitStatus, setWaitStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReconnect, setShowReconnect] = useState(false);
  const [jwt, setJwt] = useState<string | null>(null);
  const [interactiveUrl, setInteractiveUrl] = useState<string | null>(null);
  const [usdcReceived, setUsdcReceived] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>(INITIAL_STEPS);

  // Ref espejo de `open` para abortar el polling si el usuario cierra el modal.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setShowReconnect(false);
      setJwt(null);
      setInteractiveUrl(null);
      setUsdcReceived(null);
      setWaiting(false);
      setWaitStatus(null);
      setSteps(INITIAL_STEPS);
    }
  }, [open]);

  const mark = (key: StepKey, status: StepStatus) => setSteps((prev) => ({ ...prev, [key]: status }));

  const handleContinue = async () => {
    if (!walletAddress) return;
    setBusy(true);
    setError(null);
    setShowReconnect(false);
    setJwt(null);
    setInteractiveUrl(null);
    setUsdcReceived(null);
    setWaitStatus(null);
    try {
      // 1) Trustline ARS (necesaria para recibir el on-ramp y operar el swap).
      mark('trustline', 'running');
      await ensureTrustline(walletAddress, ARS, ASSETS[ARS].issuer);
      await ensureTrustline(walletAddress, USDC, ASSETS[USDC].issuer);
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
        if (sub === 'sign') mark('challenge', 'done');
        if (sub === 'token') mark('sign', 'done');
      });
      mark('token', 'done');
      setJwt(jwtToken);
      setSharedJwt(jwtToken);

      // 3) SEP-24: iniciar depósito interactivo y abrir Anclap en otra pestaña.
      mark('deposit', 'running');
      const { id, url } = await startInteractive('deposit', jwtToken, { asset_code: ARS, account: walletAddress });
      setInteractiveUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      mark('deposit', 'done');
      toast.success(t('wallet.fiat.receive.depositStarted', 'Deposit started — continue on Anclap.'));

      // 4) Esperar a que Anclap acredite los ARS on-chain (polling de la tx).
      mark('credit', 'running');
      setWaiting(true);
      const tx = await waitForCompletion(id, jwtToken, {
        shouldStop: () => !openRef.current,
        onStatus: (status) => setWaitStatus(status ?? null),
      });
      setWaiting(false);
      const arsAmount = tx.amount_out ?? tx.amount_in;
      if (!arsAmount) throw new AnclapError('La transacción no informó el monto acreditado (amount_out).');
      mark('credit', 'done');

      // 5) Swap ARS -> USDC con lo que se acreditó.
      mark('swap', 'running');
      const { quotedOut } = await swap({
        account: walletAddress,
        send: assetParam(ARS, ASSETS[ARS].issuer),
        sendAmount: arsAmount,
        dest: assetParam(USDC, ASSETS[USDC].issuer),
      });
      mark('swap', 'done');
      setUsdcReceived(quotedOut);
      toast.success(t('wallet.fiat.receive.swapDone', 'Converted to USDC — done!'));
    } catch (e) {
      if (e instanceof AnclapCancelled) return;
      const msg = e instanceof AnclapError || e instanceof Error ? e.message : String(e);
      setError(msg);
      setSteps((prev) => {
        const next = { ...prev };
        (Object.keys(next) as StepKey[]).forEach((k) => {
          if (next[k] === 'running') next[k] = 'error';
        });
        return next;
      });
      if (walletType) setShowReconnect(true);
    } finally {
      setWaiting(false);
      setBusy(false);
    }
  };

  // Continúa una tx del historial: hidrata el stepper, reanuda el polling de la
  // acreditación (si sigue en curso) y termina el swap ARS -> USDC.
  // Nota: si el depósito ya estaba `completed` y el swap se hizo en una sesión
  // previa, este intento fallará al no haber ARS suficientes (no duplica).
  const resumeTx = async (tx: SepTransaction, tokenJwt: string) => {
    if (busy || !walletAddress) return;
    const account = walletAddress;
    const failed = tx.status ? FAILED.has(tx.status) : false;
    const credited = tx.status === 'completed';

    setError(failed ? tx.message ?? tx.status ?? null : null);
    setShowReconnect(false);
    setUsdcReceived(null);
    setInteractiveUrl(tx.more_info_url ?? null);
    setWaitStatus(tx.status ?? null);
    setJwt(tokenJwt);
    setSharedJwt(tokenJwt);
    // Trustline + SEP-10 + inicio del depósito ya ocurrieron (la tx existe).
    setSteps({
      trustline: 'done',
      challenge: 'done',
      sign: 'done',
      token: 'done',
      deposit: 'done',
      credit: credited ? 'done' : failed ? 'error' : 'running',
      swap: 'idle',
    });
    if (failed) return; // terminal con error: nada que reanudar

    setBusy(true);
    try {
      // 1) Esperar (o confirmar) la acreditación de ARS on-chain.
      let creditedTx = tx;
      if (!credited) {
        setWaiting(true);
        creditedTx = await waitForCompletion(tx.id, tokenJwt, {
          shouldStop: () => !openRef.current,
          onStatus: (status) => setWaitStatus(status ?? null),
        });
        setWaiting(false);
        mark('credit', 'done');
      }
      const arsAmount = creditedTx.amount_out ?? creditedTx.amount_in;
      if (!arsAmount) throw new AnclapError('La transacción no informó el monto acreditado (amount_out).');

      // 2) Swap ARS -> USDC para terminar el flujo donde quedó.
      mark('swap', 'running');
      const { quotedOut } = await swap({
        account,
        send: assetParam(ARS, ASSETS[ARS].issuer),
        sendAmount: arsAmount,
        dest: assetParam(USDC, ASSETS[USDC].issuer),
      });
      mark('swap', 'done');
      setUsdcReceived(quotedOut);
      toast.success(t('wallet.fiat.receive.swapDone', 'Converted to USDC — done!'));
    } catch (e) {
      if (e instanceof AnclapCancelled) return;
      const msg = e instanceof AnclapError || e instanceof Error ? e.message : String(e);
      setError(msg);
      setSteps((prev) => {
        const next = { ...prev };
        (Object.keys(next) as StepKey[]).forEach((k) => {
          if (next[k] === 'running') next[k] = 'error';
        });
        return next;
      });
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
    challenge: t('wallet.fiat.send.stepChallenge', 'SEP-10 · Request challenge'),
    sign: t('wallet.fiat.send.stepSign', 'SEP-10 · Sign (wallet)'),
    token: t('wallet.fiat.send.stepToken', 'SEP-10 · Get Anclap JWT'),
    deposit: t('wallet.fiat.receive.stepDeposit', 'SEP-24 · Start deposit'),
    credit: t('wallet.fiat.receive.stepCredit', 'Wait for ARS credit'),
    swap: t('wallet.fiat.receive.stepSwap', 'Convert ARS → USDC'),
  };
  const order: StepKey[] = ['trustline', 'challenge', 'sign', 'token', 'deposit', 'credit', 'swap'];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      // Durante la espera de acreditación dejamos cerrar (puede tardar); el
      // polling se aborta solo. En los pasos rápidos (firmas) bloqueamos.
      isDismissable={!busy || waiting}
      title={t('wallet.fiat.receive.title', 'Receive fiat (ARS)')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={
        showReconnect ? (
          <Button
            onPress={handleReconnect}
            className="w-full border px-4 py-6 bg-primary border-black border-b-5 font-bold rounded-md text-black"
          >
            {t('wallet.fiat.receive.reconnect', 'Reconnect wallet')}
          </Button>
        ) : (
          <Button
            onPress={handleContinue}
            isDisabled={busy || !walletAddress}
            className="w-full border px-4 py-6 bg-primary border-black border-b-5 font-bold rounded-md text-black"
          >
            {busy ? (
              <>
                <Spinner size="sm" color="current" /> {t('wallet.fiat.receive.processing', 'Processing…')}
              </>
            ) : (
              t('wallet.fiat.receive.cta', 'Continue')
            )}
          </Button>
        )
      }
    >
      <p className="text-sm text-gray-600">
        {t(
          'wallet.fiat.receive.description',
          'Buy ARS with Anclap and receive it in your wallet, then we convert it to USDC automatically.',
        )}
      </p>

      <FiatStepList
        steps={order.map((key) => ({
          key,
          label: stepLabels[key],
          status: steps[key],
          implemented: IMPLEMENTED.includes(key),
        }))}
      />

      {waiting && (
        <p className="text-xs text-gray-500">
          {t('wallet.fiat.receive.waitingHint', 'Complete the deposit on Anclap. We are waiting for the ARS to be credited…')}
          {waitStatus ? ` (${waitStatus})` : ''}
        </p>
      )}

      {usdcReceived && (
        <p className="text-sm font-semibold text-success">
          {t('wallet.fiat.receive.usdcReceived', '≈ {{amount}} USDC received', { amount: usdcReceived })}
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
          {t('wallet.fiat.receive.openAnclap', 'Open Anclap')}
        </a>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <FiatTxHistory assetCode={ARS} kind="deposit" jwt={jwt} onResume={resumeTx} />
    </AppModal>
  );
}
