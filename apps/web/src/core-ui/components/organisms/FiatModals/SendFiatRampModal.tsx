'use client';

import {
  type Corridor,
  type CorridorCode,
  isLiquidityRail,
  RampCancelled,
  type RampQuote,
  RampError,
  useRampOfframp,
} from '@/networks/pollar/ramps';
import {
  advanceWithdrawal,
  markWithdrawalTerminal,
  startWithdrawal,
} from '@/networks/pollar/offrampApi';
import { fieldsAreValid, type RampField, rampErrorMessage } from '@/networks/pollar/rampFields';
import { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import type { RampTxStatus } from '@pollar/core';
import { Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiExternalLink } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { AMOUNT_DECIMALS, floorAmount } from '../../../helpers/numbers';
import { useLivePassiveUsdc } from '../../../hooks';
import { useConfigStore, useRampActiveStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { FiatStepList, StepStatus } from './FiatStepList';
import { RAMP_FIELD_CLASS, RampFieldList } from './RampFieldList';

interface SendFiatRampModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Corredor elegido en el selector de país. */
  country: CorridorCode;
  /** Vuelve al selector de país. */
  onBack?: () => void;
}

type Phase = 'amount' | 'details' | 'run';
type StepKey = 'funds' | 'create' | 'payout';

/**
 * El USDC sale del vault ANTES de crear el retiro. Con wallet custodial, Pollar
 * arma y envía el pago on-chain en el mismo momento de crear —la respuesta ya
 * trae `stellarTxHash`—, así que si la wallet está vacía no hay con qué pagar y
 * la transacción queda en `pending` sin hash, sin forma de retomarla.
 */
const STEP_ORDER: StepKey[] = ['funds', 'create', 'payout'];

const INITIAL_STEPS: Record<StepKey, StepStatus> = { create: 'idle', funds: 'idle', payout: 'idle' };

/**
 * The fiat the quote SETTLES, which is not necessarily the one that was asked
 * for: the provider quotes on the crypto side, so asking for 12 BOB lands near
 * it — at 12.13 — and that is what reaches the bank. This is the amount on
 * screen; the requested one only serves to quote.
 *
 * Falls back to the requested amount when the quote does not carry it, since
 * that is all there is to go on.
 */
const settledFiatOf = (quote: RampQuote | null, requested: number): number => {
  const settled = Number(quote?.fiatAmount);
  return Number.isFinite(settled) && settled > 0 ? settled : requested;
};

/**
 * Fiat off-ramp over Pollar's ramps endpoints, for any of the corridors the app
 * exposes (Brazil over Pix, Colombia over PSE or Bre-B with Abroad). It shares
 * the skeleton of {@link SendFiatModal} (Argentina/Anclap): a three-lock
 * stepper, the money leaves the vault for the wallet BEFORE it is handed to the
 * ramp, and the polling aborts if the user closes the modal.
 *
 * The big difference is the unit of the amount. With Anclap we run the
 * USDC → ARS swap ourselves, so that modal asks for USDC; here the amount is
 * chosen in LOCAL CURRENCY because `/ramps/quote` filters providers by the
 * corridor's fiat currency and quoting in USDC returns an empty list. The quote
 * publishes what it costs in USDC (`cryptoAmount`) and the confirmation shows
 * it, along with the fiat that actually settles (`fiatAmount`), which may not be
 * what the user typed.
 *
 * Nothing about the corridor is hardcoded beyond the symbol: the currency comes
 * from `getRampCountries`, and the rail, the provider and the form fields are
 * decided by the quote. Adding a country means adding it to `CORRIDORS` and to
 * the picker.
 */
export function SendFiatRampModal({ open, onOpenChange, country, onBack }: SendFiatRampModalProps) {
  const { t } = useTranslation();
  const { token } = useConfigStore();
  const { wallet, refreshAssets, refreshWalletBalance } = usePollar();
  const walletAddress = wallet?.address ?? null;

  const {
    resolveCorridor,
    railLiquidity,
    quoteFiat,
    createOfframp,
    waitForKycApproval,
    completeWithdraw,
    waitForPaymentHash,
    confirmOnLedger,
    waitForPayout,
  } = useRampOfframp();
  // Mientras dura el flujo, el USDC que sacamos del vault NO es plata ociosa: sin
  // esto el gate de `useIdleFunds` lo devuelve al vault y la rampa se queda sin
  // nada que cobrar.
  const setRampActive = useRampActiveStore((s) => s.setRampActive);
  useEffect(() => () => setRampActive(false), [setRampActive]);

  // Al cerrarse el modal —terminado, fallado, o abandonado a mitad— el USDC que
  // sacamos del vault puede haber quedado en la wallet sin llegar nunca a la
  // rampa: el retiro salió del vault en el paso 1 y cualquier error posterior lo
  // deja ahí. Se refresca el balance custodial para que el gate de plata ociosa
  // (`useIdleFunds`, que vive en otro subárbol y sólo pollea mientras se espera
  // plata) lo VEA y ofrezca devolverlo al vault, en vez de que aparezca recién
  // en el próximo reload.
  //
  // Ofrecer y no hacerlo solo es a propósito: la firma custodial de Pollar tiene
  // que salir de un gesto del usuario, así que el redepósito lo dispara el botón
  // de `IdleFundsModal`. La marca se libera primero porque, mientras está
  // puesta, ese gate no promptea.
  useEffect(() => {
    if (open) return;
    setRampActive(false);
    void refreshWalletBalance();
  }, [open, setRampActive, refreshWalletBalance]);

  const [corridor, setCorridor] = useState<Corridor | null>(null);
  const [phase, setPhase] = useState<Phase>('amount');
  const [amountFiat, setAmountFiat] = useState('');
  const [quote, setQuote] = useState<RampQuote | null>(null);
  const [usdcCost, setUsdcCost] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const [corridorOff, setCorridorOff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [txStatus, setTxStatus] = useState<RampTxStatus | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>(INITIAL_STEPS);
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [tosUrl, setTosUrl] = useState<string | null>(null);
  const [usdcSpent, setUsdcSpent] = useState<number | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  // Id de la fila que sigue este retiro del lado del servidor. En un ref y no en
  // estado porque lo lee `handleRun` mientras corre: un re-render de por medio
  // le daría el valor viejo y el avance se anotaría en la nada.
  const trackedId = useRef<string | null>(null);
  // El pago salió y el proveedor todavía está acreditando: en curso, no fallado.
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref espejo de `open` para abortar el polling si el usuario cierra el modal.
  // El cleanup también lo apaga al DESMONTAR: si no, un modal que se desmonta sin
  // que `open` haya pasado por false deja su loop girando contra la transacción
  // vieja, y al reabrir quedan dos pollings simultáneos.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    return () => {
      openRef.current = false;
    };
  }, [open]);

  // Lo retirable es la posición flexible (el vault general), NO lo que está en
  // períodos bloqueados. Misma fuente que el "Available" del modal de retiro, así
  // que los dos muestran el mismo número.
  const {
    live: liveUsdc,
    isLoading: balanceIsLoading,
    refetch: refreshBalance,
  } = useLivePassiveUsdc(walletAddress ?? undefined);
  const balance = floorAmount(liveUsdc, AMOUNT_DECIMALS);

  useEffect(() => {
    if (open && walletAddress) void refreshBalance();
  }, [open, walletAddress, refreshBalance]);

  // Al abrir se resuelve el corredor contra Pollar: si el país no está entre los
  // habilitados no tiene sentido dejar cotizar. La liquidez NO se mira acá sino
  // con la cotización elegida, porque un país puede salir por más de un rail.
  //
  // No hace falta resetear el resto del estado al cerrar: el panel desmonta el
  // modal cuando termina la animación de salida.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveCorridor(country).then((resolved) => {
      if (cancelled) return;
      setCorridor(resolved);
      if (!resolved) setCorridorOff(t('wallet.fiat.ramp.corridorOff', 'This corridor is not enabled yet.'));
    });
    return () => {
      cancelled = true;
    };
  }, [open, country, resolveCorridor, t]);

  const mark = (key: StepKey, status: StepStatus) => setSteps((prev) => ({ ...prev, [key]: status }));

  const currency = corridor?.currency ?? '';
  const symbol = corridor?.symbol ?? '';
  const countryName = t(`wallet.fiat.ramp.country.${country}`, country);
  const fields: RampField[] = quote?.requiredFields ?? [];
  const amountNum = Number(amountFiat);
  const amountValid = !!amountFiat && Number.isFinite(amountNum) && amountNum > 0;
  const fieldsValid = fieldsAreValid(fields, values);
  const receiveFiat = settledFiatOf(quote, amountNum);

  const messageOf = (e: unknown): string =>
    rampErrorMessage(
      e,
      (leaf) => t(`wallet.fiat.ramp.err.${leaf}`),
      t('wallet.fiat.ramp.err.generic', 'The withdrawal could not be completed.'),
    );

  const fail = (e: unknown) => {
    setError(messageOf(e));
    setSteps((prev) => {
      const next = { ...prev };
      STEP_ORDER.forEach((k) => {
        if (next[k] === 'running') next[k] = 'error';
      });
      return next;
    });
  };

  /**
   * Validates the cost the quote publishes against the balance. Returns the
   * error message when it cannot be paid, or null when it fits.
   */
  const costProblem = (cost: number | null | undefined): string | null => {
    if (cost == null || !Number.isFinite(cost) || cost <= 0) {
      return t('wallet.fiat.ramp.err.unknownCost', 'The quote did not report how much USDC this withdrawal costs.');
    }
    if (cost > balance) {
      return t(
        'wallet.fiat.ramp.err.insufficientQuote',
        'This withdrawal costs {{cost}} USDC and your savings hold {{balance}}.',
        {
          cost,
          balance,
        },
      );
    }
    return null;
  };

  // --- Paso 1: cotizar el monto en moneda local ------------------------------
  const handleQuote = async () => {
    if (!amountValid || busy || !corridor) return;
    setBusy(true);
    setError(null);
    try {
      const quotes = await quoteFiat(corridor, amountNum);
      const best = quotes[0];
      if (!best) {
        // Sin cotizaciones no hay `minAmount`/`maxAmount` que mostrar, así que el
        // mensaje apunta al monto en vez de afirmar que no existe proveedor.
        setError(
          t('wallet.fiat.ramp.err.noRoutes', 'No route available for {{amount}} {{currency}}. Try a different amount.', {
            amount: amountNum,
            currency,
          }),
        );
        return;
      }
      // Los límites vienen en la moneda con la que se cotizó, o sea la local.
      if (best.minAmount != null && amountNum < best.minAmount) {
        setError(
          t('wallet.fiat.ramp.limitMin', 'The minimum for this route is {{amount}} {{currency}}.', {
            amount: best.minAmount,
            currency,
          }),
        );
        return;
      }
      if (best.maxAmount != null && amountNum > best.maxAmount) {
        setError(
          t('wallet.fiat.ramp.limitMax', 'The maximum for this route is {{amount}} {{currency}}.', {
            amount: best.maxAmount,
            currency,
          }),
        );
        return;
      }
      // The user typed reais or bolivianos, so only now — with the cost the
      // quote publishes — is it known whether the withdrawal fits the balance.
      const cost = best.cryptoAmount;
      const problem = costProblem(cost);
      if (problem) {
        setError(problem);
        return;
      }
      // La liquidez se consulta por el rail que resolvió la cotización (Pix o
      // Bre-B); PSE y el resto no la publican y se dejan pasar.
      if (isLiquidityRail(best.rail)) {
        const liquidity = await railLiquidity(best.rail);
        if (!liquidity.available) {
          setError(
            liquidity.message ?? t('wallet.fiat.ramp.noLiquidity', '{{rail}} is temporarily unavailable.', { rail: best.rail }),
          );
          return;
        }
      }
      setQuote(best);
      setUsdcCost(cost ?? null);
      setPhase('details');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  // --- Paso 2: ejecutar el retiro -------------------------------------------
  const handleRun = async () => {
    if (!quote || !corridor || !walletAddress || !token || busy) return;
    setPhase('run');
    setBusy(true);
    setError(null);
    setSteps(INITIAL_STEPS);
    setUsdcSpent(null);
    setPaymentHash(null);
    setSettling(false);
    setRampActive(true);

    try {
      // 1) Move the USDC the withdrawal costs from the vault to the wallet. It
      // goes FIRST because, with a custodial wallet, `createOfframp` builds and
      // sends the on-chain payment at the very moment it creates: with no USDC
      // in the wallet there is nothing to pay with and the withdrawal sits in
      // `pending` with no hash forever.
      //
      // The amount is `quote.cryptoAmount`, the EXACT charge fixed at quote
      // time. Dividing the requested fiat by `rate` lands on a different number,
      // because `rate` is published against the fiat that settles and the charge
      // is rounded to the cent. It is not clamped to the balance either:
      // withdrawing less than the charge guarantees a short payment, and
      // `costProblem` already rejected the withdrawal if it does not fit.
      mark('funds', 'running');
      const cost = quote.cryptoAmount;
      const costIssue = costProblem(cost);
      if (costIssue) throw new RampError(costIssue);
      const toWithdraw = cost as number;

      // La fila se abre ANTES de sacar del vault, no después de crear con el
      // proveedor: si el retiro se cae en el medio, la plata ya se movió y esta
      // es la única constancia de que existió. Best-effort — no poder
      // registrarlo no puede impedir un retiro que el usuario pidió.
      trackedId.current = await startWithdrawal(walletAddress, {
        country: corridor.country,
        amountFiat: String(receiveFiat),
        currency: corridor.currency,
        provider: quote.provider,
        rail: quote.rail,
        usdcAmount: String(toWithdraw),
      });

      const { hash: vaultHash } = await passiveWithdraw({
        address: walletAddress,
        amount: String(toWithdraw),
        decimals: token.decimals,
        withdrawAll: toWithdraw >= balance,
      });
      await refreshAssets();
      setUsdcSpent(toWithdraw);
      mark('funds', 'done');
      void advanceWithdrawal(walletAddress, trackedId.current, {
        step: 'create',
        vaultWithdrawHash: vaultHash,
      });

      // 2) Crear el retiro por el monto en moneda local. Si el proveedor pide KYC
      // hay que esperar la aprobación y volver a cotizar, porque la cotización
      // vence a los 15 minutos; Abroad no publica link propio, así que ahí sólo
      // queda esperar.
      mark('create', 'running');
      let active = quote;
      let result = await createOfframp({ corridor, quote: active, amountFiat: amountNum, walletAddress, values });

      if (result.kycRequired) {
        setKycUrl(result.kycUrl ?? null);
        setTosUrl(result.tosUrl ?? null);
        if (result.kycUrl) window.open(result.kycUrl, '_blank', 'noopener,noreferrer');
        toast.success(t('wallet.fiat.ramp.kycStarted', 'Verification pending — finish it with the provider.'));
        setWaiting(true);
        await waitForKycApproval({ shouldStop: () => !openRef.current });
        setWaiting(false);

        const fresh = (await quoteFiat(corridor, amountNum))[0];
        if (!fresh) {
          throw new RampError(
            t('wallet.fiat.ramp.err.noRoutes', 'No route available for {{amount}} {{currency}}. Try a different amount.', {
              amount: amountNum,
              currency,
            }),
          );
        }
        // The rate can move while the KYC runs, so the cost of the new quote is
        // revalidated against the balance before going on.
        const freshCost = fresh.cryptoAmount;
        const problem = costProblem(freshCost);
        if (problem) throw new RampError(problem);
        active = fresh;
        setQuote(fresh);
        setUsdcCost(freshCost ?? null);
        result = await createOfframp({ corridor, quote: fresh, amountFiat: amountNum, walletAddress, values });
      }
      setTxStatus(result.status);
      mark('create', 'done');
      // Recién acá existe el retiro para el proveedor. `active` puede no ser la
      // cotización original: si hubo KYC se recotizó, y el proveedor y el rail
      // que valen son los de la que se usó.
      void advanceWithdrawal(walletAddress, trackedId.current, {
        step: 'payout',
        providerTxId: result.txId,
        provider: active.provider,
        rail: active.rail,
      });

      // 3) Confirmar que el pago on-chain salió. El acuse es `stellarTxHash`, no
      // el 200: con wallet custodial ya viene en la respuesta de crear; si no
      // está (wallet externa, o un anchor que exige el paso aparte) se dispara
      // `completeWithdraw`. Sin hash, esperar la liquidación sería esperar para
      // siempre, así que se corta con un mensaje que dice dónde quedó la plata.
      mark('payout', 'running');
      setWaiting(true);
      let hash =
        result.stellarTxHash ??
        (await waitForPaymentHash(result.txId, {
          shouldStop: () => !openRef.current,
          onStatus: (s) => setTxStatus(s),
        }));

      if (!hash) {
        const completed = await completeWithdraw(result.txId);
        setTxStatus(completed.status);
        hash =
          completed.stellarTxHash ??
          (await waitForPaymentHash(result.txId, {
            shouldStop: () => !openRef.current,
            onStatus: (s) => setTxStatus(s),
          }));
        if (!hash && completed.status !== 'completed') {
          throw new RampError(
            t(
              'wallet.fiat.ramp.err.paymentNotSubmitted',
              'The provider accepted the withdrawal but never sent the on-chain payment. Your USDC is in your wallet — try again.',
            ),
          );
        }
      }
      setPaymentHash(hash ?? null);
      if (hash) void advanceWithdrawal(walletAddress, trackedId.current, { paymentHash: hash });

      // El hash que informa el proveedor NO prueba que la plata se haya movido:
      // es el de la transacción que armó, y viene igual si nunca se difundió. Se
      // confirma contra Horizon antes de dar el pago por hecho, porque si no
      // llegó a un ledger el USDC sigue en la wallet y esperar la acreditación
      // sería esperar para siempre.
      if (hash && !(await confirmOnLedger(hash, { shouldStop: () => !openRef.current }))) {
        throw new RampError(
          t(
            'wallet.fiat.ramp.err.paymentNotOnChain',
            'The provider reported a payment ({{hash}}) that never reached the network. Your USDC is still in your wallet.',
            { hash: truncateMiddle(hash, 6, 6) },
          ),
        );
      }

      // A partir de acá el retiro ya no depende de nosotros: el USDC llegó al
      // proveedor y falta que acredite la moneda local. Si eso tarda más que la
      // ventana de seguimiento no es una falla, así que el paso queda en curso y
      // el usuario puede cerrar — no se le muestra un error sobre plata que está
      // en camino.
      const finalStatus = await waitForPayout(result.txId, {
        shouldStop: () => !openRef.current,
        onStatus: (s) => setTxStatus(s),
      });
      setWaiting(false);
      if (finalStatus === 'completed') {
        mark('payout', 'done');
        void markWithdrawalTerminal(walletAddress, trackedId.current, 'settled');
        trackedId.current = null;
        toast.success(t('wallet.fiat.ramp.settled', 'Withdrawal paid out via {{rail}}.', { rail: active.rail }));
      } else {
        // Sigue acreditando: no se cierra la fila, porque el retiro todavía no
        // terminó. Si el usuario no vuelve, la ventana de gracia la cierra sola.
        setSettling(true);
      }
    } catch (e) {
      // Cancelación (el usuario cerró el modal durante la espera): no es error, y
      // la fila queda ABIERTA a propósito — el retiro sigue su curso del lado del
      // proveedor y el usuario puede volver. La ventana de gracia la cierra si
      // nadie vuelve.
      if (e instanceof RampCancelled) return;
      fail(e);
      // Acá sí falló: se cierra con el motivo, que es lo que después explica
      // dónde quedó la plata.
      void markWithdrawalTerminal(walletAddress, trackedId.current, 'failed', messageOf(e));
      trackedId.current = null;
    } finally {
      setWaiting(false);
      setBusy(false);
      // Se libera pase lo que pase: si el retiro falló, ese USDC SÍ quedó ocioso
      // en la wallet y el gate tiene que poder ofrecer devolverlo al vault.
      setRampActive(false);
    }
  };

  const rail = quote?.rail ?? '';
  const groupLabels: Record<StepKey, string> = {
    create: t('wallet.fiat.ramp.groupCreate', 'Start the withdrawal with {{provider}}', {
      provider: quote?.provider ?? '',
    }),
    funds: t('wallet.fiat.ramp.groupFunds', 'Withdraw from your savings'),
    payout: t('wallet.fiat.ramp.groupPayout', 'Pay out via {{rail}}', { rail }),
  };

  const footer =
    phase === 'amount' ? (
      <PressableButton
        variant="success"
        size="cta"
        onClick={handleQuote}
        disabled={!amountValid || busy || !!corridorOff || !corridor || !walletAddress}
      >
        {busy ? (
          <>
            <Spinner size="sm" color="current" /> {t('wallet.fiat.ramp.quoting', 'Finding a route…')}
          </>
        ) : (
          t('wallet.fiat.ramp.continue', 'Continue')
        )}
      </PressableButton>
    ) : phase === 'details' ? (
      <PressableButton variant="success" size="cta" onClick={handleRun} disabled={!fieldsValid || busy || !token}>
        {t('wallet.fiat.ramp.cta', 'Withdraw')}
      </PressableButton>
    ) : (
      <p className="w-full text-center text-xs text-gray-500">
        {busy
          ? t('wallet.fiat.ramp.waitingHint', 'We are waiting for the provider to confirm…')
          : t('wallet.fiat.ramp.doneHint', 'You can close this window.')}
        {txStatus ? ` (${txStatus})` : ''}
      </p>
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      // Con el retiro en curso no se cierra tocando afuera: la plata ya salió
      // del vault y está en camino a la rampa, y un toque al borde en medio de
      // eso deja al usuario sin la única pantalla que le dice dónde quedó. Antes
      // se permitía durante la espera del KYC, que es la parte más larga y
      // justamente la más fácil de cerrar sin querer.
      //
      // La X sigue ahí a propósito: la espera del proveedor puede no terminar
      // nunca, y el polling se aborta solo al cerrar. Es un cierre deliberado,
      // no un accidente.
      isDismissable={!busy}
      title={t('wallet.fiat.ramp.title', 'Withdraw to {{country}} ({{currency}})', {
        country: countryName,
        currency: currency || country,
      })}
      size="md"
      onBack={phase === 'details' ? () => setPhase('amount') : onBack}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={footer}
    >
      {corridorOff && (
        <p className="rounded-md border border-black border-b-2 bg-[#FFF4DD] px-3 py-2 text-xs font-semibold text-black">
          {corridorOff}
        </p>
      )}

      {/* --- Monto en MONEDA LOCAL: es la unidad con la que cotizan los endpoints
          de ramps. Cuánto USDC cuesta se resuelve con la cotización y se muestra
          en la confirmación. --- */}
      {phase === 'amount' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500" htmlFor="ramp-amount">
            {t('wallet.fiat.ramp.amountLabel', 'How much do you want to receive?')}
          </label>
          <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-lg font-bold text-black">{symbol}</span>
            <input
              id="ramp-amount"
              type="text"
              inputMode="decimal"
              value={amountFiat}
              onChange={(e) => setAmountFiat(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
              disabled={busy}
              placeholder="0.00"
              className={RAMP_FIELD_CLASS}
            />
            <span className="shrink-0 text-sm font-semibold text-gray-500">{currency}</span>
          </div>
          <p className="text-xs text-gray-500">
            {balanceIsLoading
              ? t('wallet.fiat.ramp.balanceLoading', 'Reading your savings…')
              : t('wallet.fiat.ramp.balance', 'Available in savings: {{balance}} USDC', { balance })}
          </p>
        </div>
      )}

      {/* --- Ruta elegida + datos que pide el proveedor (los define la cotización). --- */}
      {phase === 'details' && quote && (
        <>
          <div className="flex flex-col gap-1 rounded-lg border border-black border-b-2 bg-white p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-black">{quote.provider}</span>
              <span className="text-xs font-semibold text-gray-500">{quote.rail}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.ramp.youReceive', 'You receive')}</span>
              <span className="font-semibold text-black">
                {symbol} {receiveFiat} {currency}
              </span>
            </div>
            {usdcCost != null && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{t('wallet.fiat.ramp.youSend', 'Leaves your savings')}</span>
                <span className="font-semibold text-black">
                  {t('wallet.fiat.ramp.costUsdc', '{{amount}} USDC', { amount: usdcCost })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.ramp.etaLabel', 'Estimated time')}</span>
              <span className="font-semibold text-black">{quote.estimatedTime}</span>
            </div>
          </div>

          <RampFieldList
            fields={fields}
            values={values}
            onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
            disabled={busy}
          />
        </>
      )}

      {/* --- Stepper del retiro. --- */}
      {phase === 'run' && (
        <>
          <FiatStepList
            steps={STEP_ORDER.map((key) => ({
              key,
              label: groupLabels[key],
              status: steps[key],
              implemented: true,
            }))}
          />

          {/* El pago on-chain puede tardar en confirmar y el proveedor en
              liquidar. Sin este aviso el último paso parece trabado. */}
          {waiting && steps.payout === 'running' && !settling && (
            <p className="text-xs text-gray-500">
              {t('wallet.fiat.ramp.waitingReady', 'Waiting for {{provider}} to settle the payment…', {
                provider: quote?.provider ?? '',
                eta: quote?.estimatedTime ?? '',
              })}
            </p>
          )}

          {/* Dejamos de esperar pero el retiro sigue su curso: se dice explícito
              para que "no terminó de cargar" no se lea como "falló". */}
          {settling && (
            <p className="rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-xs font-semibold text-black">
              {t(
                'wallet.fiat.ramp.settling',
                'Your USDC reached {{provider}} and the {{rail}} payout is on its way. It can take a while — you can close this window.',
                { provider: quote?.provider ?? '', rail },
              )}
            </p>
          )}

          {usdcSpent != null && (
            <p className="text-sm font-semibold text-black">
              {t('wallet.fiat.ramp.usdcSpent', '{{amount}} USDC left your savings', { amount: usdcSpent })}
            </p>
          )}

          {paymentHash && (
            <a
              href={`https://stellar.expert/explorer/public/tx/${paymentHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-black"
            >
              {t('wallet.fiat.ramp.paymentSent', 'On-chain payment sent: {{hash}}', {
                hash: truncateMiddle(paymentHash, 6, 6),
              })}
            </a>
          )}

          {steps.payout === 'done' && (
            <p className="text-success text-sm font-semibold">
              {t('wallet.fiat.ramp.settled', 'Withdrawal paid out via {{rail}}.', { rail })}
            </p>
          )}

          {(kycUrl || tosUrl) && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500">
                {t('wallet.fiat.ramp.kycHint', 'The provider needs to verify your identity before paying out.')}
              </p>
              {[
                { url: kycUrl, label: t('wallet.fiat.ramp.openKyc', 'Open verification') },
                { url: tosUrl, label: t('wallet.fiat.ramp.openTos', 'Open terms') },
              ]
                .filter((l): l is { url: string; label: string } => !!l.url)
                .map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#c4ecff]"
                  >
                    <FiExternalLink className="h-4 w-4" />
                    {link.label}
                  </a>
                ))}
            </div>
          )}

          {/* Abroad no publica link de KYC: mientras espera, el usuario no tiene
              nada que abrir y sin este aviso el paso parece colgado. */}
          {waiting && !kycUrl && !tosUrl && steps.create === 'running' && (
            <p className="text-xs text-gray-500">
              {t('wallet.fiat.ramp.kycNoLink', 'The provider is reviewing your identity. This can take a while.')}
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </AppModal>
  );
}
