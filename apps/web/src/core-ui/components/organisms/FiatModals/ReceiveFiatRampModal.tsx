'use client';

import { type PaymentInstructions, readPaymentInstructions } from '@/networks/pollar/onrampPayment';
import { type OnrampScreen, receivedUsdcFrom, screenFor, shouldPoll, terminalStatusFor } from '@/networks/pollar/onrampFlow';
import { fetchPendingPurchase, markPurchaseTerminal, recordPurchase } from '@/networks/pollar/onrampApi';
import { fieldsAreValid, type RampField, rampErrorMessage } from '@/networks/pollar/rampFields';
import { type OnrampCorridor, type OnrampCorridorCode, useRampOnramp, usdcOutOf } from '@/networks/pollar/rampsOnramp';
import type { RampQuote, RampTxStatus } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAwaitingFundsStore, useRampActiveStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { OnrampQrScreen } from './OnrampQrScreen';
import { OnrampStatusScreen } from './OnrampStatusScreen';
import { RAMP_FIELD_CLASS, RampFieldList } from './RampFieldList';

interface ReceiveFiatRampModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Corredor elegido en el selector de país. */
  country: OnrampCorridorCode;
  /** Vuelve al selector de país. */
  onBack?: () => void;
}

/** Espera antes de cotizar mientras el usuario sigue tipeando el monto. */
const QUOTE_DEBOUNCE_MS = 450;

/** Cada cuánto se le pregunta al proveedor si el pago entró. */
const POLL_MS = 8000;

/** El reloj del modal: un tick por segundo alcanza para la cuenta regresiva. */
const TICK_MS = 1000;

/** Elegir cuánto gastar, los datos que pida el proveedor, y pagar el QR. */
type Phase = 'amount' | 'details' | 'paying';

/** Decimales con los que se muestra el USDC estimado. */
const usdcLabel = (amount: number) => (Math.floor(amount * 100) / 100).toFixed(2);

/**
 * Compra de USDC con moneda local (hoy sólo Bolivia/BOB). Va en dos pasos: el
 * monto —con la cotización actualizándose en vivo mientras se escribe— y después
 * los datos que pida el proveedor. El pago del QR y la acreditación llegan
 * después.
 *
 * El formulario de datos no tiene nada boliviano cableado: los campos salen de
 * la cotización elegida y los dibuja el mismo componente que usa el off-ramp.
 *
 * El monto se pide en MONEDA LOCAL porque es la unidad con la que cotizan los
 * endpoints de ramps, y además es como el usuario piensa la compra: paga
 * bolivianos desde la app de su banco.
 */
export function ReceiveFiatRampModal({ open, onOpenChange, country, onBack }: ReceiveFiatRampModalProps) {
  const { t } = useTranslation();
  const { resolveCorridor, quoteFiat, ensureUsdcTrustline, createOnramp, readOnrampTransaction } = useRampOnramp();
  const { wallet, refreshAssets } = usePollar();
  const walletAddress = wallet?.address ?? null;

  const [phase, setPhase] = useState<Phase>('amount');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'trustline' | 'creating' | null>(null);
  const [instructions, setInstructions] = useState<PaymentInstructions | null>(null);
  const [unrecorded, setUnrecorded] = useState(false);
  const [resuming, setResuming] = useState(false);
  // Handles de la compra en curso: el del proveedor para preguntar por ella, el
  // local para poder cerrarla.
  const [txId, setTxId] = useState<string | null>(null);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<RampTxStatus | null>(null);
  const [providerAmount, setProviderAmount] = useState<{ amount: number; currency: string } | null>(null);
  // Lo pagado y lo estimado se guardan aparte del formulario porque al retomar
  // una compra vienen del registro, no de lo que el usuario tenga escrito.
  const [paid, setPaid] = useState<{ amount: string; currency: string } | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const closed = useRef<string | null>(null);
  // Se incrementa para forzar una cotización nueva sobre el MISMO monto, que es
  // lo que hace falta al volver de un código vencido: la cotización vieja venció
  // con él y crear la compra con ella fallaría.
  const [requote, setRequote] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [amountFiat, setAmountFiat] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [corridor, setCorridor] = useState<OnrampCorridor | null>(null);
  const [corridorOff, setCorridorOff] = useState<string | null>(null);
  // El resultado de cotizar se guarda JUNTO AL MONTO que lo produjo. Así no hay
  // que ir limpiándolo a mano cada vez que el usuario cambia el número: si el
  // monto guardado no es el que está escrito, el resultado está viejo y no se
  // muestra. Es lo mismo que evita mostrar la cotización de 100 mientras el
  // usuario ya escribió 1000.
  const [result, setResult] = useState<{ amount: string; quote: RampQuote | null; error: string | null } | null>(null);

  const currency = corridor?.currency ?? '';
  const symbol = corridor?.symbol ?? '';
  const countryName = t(`wallet.fiat.onramp.country.${country}`, country);
  const amountNum = Number(amountFiat);
  const amountValid = !!amountFiat && Number.isFinite(amountNum) && amountNum > 0;

  const messageOf = (e: unknown): string =>
    rampErrorMessage(
      e,
      (leaf) => t(`wallet.fiat.onramp.err.${leaf}`),
      t('wallet.fiat.onramp.err.generic', 'The purchase could not be quoted.'),
    );

  /** Límites de la ruta, en moneda local. Devuelve el mensaje o null si entra. */
  const limitProblem = (best: RampQuote, amount: number): string | null => {
    if (best.minAmount != null && amount < best.minAmount) {
      return t('wallet.fiat.onramp.limitMin', 'The minimum for this route is {{amount}} {{currency}}.', {
        amount: best.minAmount,
        currency,
      });
    }
    if (best.maxAmount != null && amount > best.maxAmount) {
      return t('wallet.fiat.onramp.limitMax', 'The maximum for this route is {{amount}} {{currency}}.', {
        amount: best.maxAmount,
        currency,
      });
    }
    return null;
  };

  // Al abrir se resuelve el corredor contra Pollar: si el país no está entre los
  // habilitados no tiene sentido dejar cotizar.
  //
  // No hace falta resetear el resto del estado al cerrar: el panel desmonta el
  // modal cuando termina la animación de salida.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveCorridor(country).then((resolved) => {
      if (cancelled) return;
      setCorridor(resolved);
      if (!resolved) setCorridorOff(t('wallet.fiat.onramp.corridorOff', 'This corridor is not enabled yet.'));
    });
    return () => {
      cancelled = true;
    };
  }, [open, country, resolveCorridor, t]);

  // Cotización en vivo: se recotiza cada vez que el monto se queda quieto. Es lo
  // que hace que el usuario vea cuánto USDC recibe MIENTRAS elige cuánto gastar,
  // en vez de descubrirlo recién en la pantalla siguiente.
  //
  // `cancelled` descarta la respuesta de un monto viejo: sin eso, una cotización
  // lenta puede pisar a la del monto que el usuario tiene escrito ahora.
  useEffect(() => {
    if (!corridor || !amountValid) return;
    const amount = amountFiat;
    const value = amountNum;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const quotes = await quoteFiat(corridor, value);
          if (cancelled) return;
          const best = quotes[0];
          if (!best) {
            // Sin cotizaciones no hay `minAmount`/`maxAmount` que mostrar, así que
            // el mensaje apunta al monto en vez de afirmar que no hay proveedor.
            setResult({
              amount,
              quote: null,
              error: t(
                'wallet.fiat.onramp.err.noRoutes',
                'No route available for {{amount}} {{currency}}. Try a different amount.',
                { amount: value, currency },
              ),
            });
            return;
          }
          setResult({ amount, quote: best, error: limitProblem(best, value) });
        } catch (e) {
          if (cancelled) return;
          setResult({ amount, quote: null, error: messageOf(e) });
        }
      })();
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridor, amountFiat, requote]);

  // Retomar una compra a medias. El servidor guarda el id de transacción, y con
  // ese id el proveedor devuelve el QR, los datos y el vencimiento: por eso esto
  // funciona en un teléfono que nunca vio la compra, no hace falta nada guardado
  // acá. Si el pago se acreditó mientras el usuario no estaba, el estado del
  // proveedor manda y la pantalla que aparece es la de compra acreditada.
  useEffect(() => {
    if (!open || !walletAddress) return;
    let cancelled = false;
    void (async () => {
      setResuming(true);
      try {
        const found = await fetchPendingPurchase(walletAddress);
        if (cancelled || !found) return;
        const tx = await readOnrampTransaction(found.purchase.providerTxId);
        if (cancelled) return;

        setPurchaseId(found.purchase.id);
        setTxId(found.purchase.providerTxId);
        setPaid({ amount: found.purchase.amountFiat, currency: found.purchase.currency });
        setProviderStatus(tx.status);
        setProviderAmount({ amount: tx.amount, currency: tx.currency });
        setInstructions(readPaymentInstructions(tx));
        setNow(new Date());
        setPhase('paying');
      } catch {
        // No poder retomar no bloquea nada: el usuario empieza una compra nueva
        // y la vieja sigue registrada para el próximo intento.
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, walletAddress, readOnrampTransaction]);

  // El reloj del modal. Corre sólo en la pantalla de pago y se limpia al salir
  // de ella o al desmontar el modal, así que no queda ningún timer suelto.
  useEffect(() => {
    if (phase !== 'paying') return;
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  // Mientras la pantalla de pago está abierta hay una compra a medio camino: el
  // USDC que se acredite es de ella y no plata que quedó quieta, así que el
  // prompt de invertir no debe taparla. Al cerrarse la marca se apaga y el
  // prompt vuelve a ofrecerse, igual que después de cualquier otro depósito.
  //
  // Al mismo tiempo el balance se consulta seguido: la plata entra por fuera de
  // la app —el usuario paga desde el banco— y nadie nos avisa cuando llega.
  const setRampActive = useRampActiveStore((s) => s.setRampActive);
  const setAwaitingFunds = useAwaitingFundsStore((s) => s.setAwaitingFunds);
  useEffect(() => {
    const paying = open && phase === 'paying';
    setRampActive(paying);
    setAwaitingFunds(paying);
    return () => {
      setRampActive(false);
      setAwaitingFunds(false);
    };
  }, [open, phase, setRampActive, setAwaitingFunds]);

  // Qué pantalla corresponde sale de una sola función pura sobre lo que dijo el
  // proveedor y el reloj: acá no se decide nada.
  const expiresAt = instructions?.expiresAt ?? null;
  const screen: OnrampScreen = screenFor({ providerStatus, expiresAt, now });
  const receivedUsdc = providerAmount ? receivedUsdcFrom(providerAmount, estimate) : estimate;

  // Mientras la compra pueda cambiar sola se le pregunta al proveedor. Un error
  // de red no rompe nada: la vuelta siguiente reintenta, y el usuario sigue
  // viendo su QR.
  useEffect(() => {
    if (phase !== 'paying' || !txId || !shouldPoll(screen)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const tx = await readOnrampTransaction(txId);
          if (cancelled) return;
          setProviderStatus(tx.status);
          setProviderAmount({ amount: tx.amount, currency: tx.currency });
        } catch {
          // Reintenta en la próxima vuelta.
        }
      })();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, txId, screen, readOnrampTransaction]);

  // Cerrar la compra del lado del servidor cuando llegó a su desenlace, una sola
  // vez.
  //
  // El vencimiento NO se cierra solo a propósito: el usuario puede haber pagado
  // segundos antes de que el reloj llegue a cero, y una compra cerrada ya no se
  // retoma. Queda abierta hasta que el usuario pide un código nuevo, que es
  // cuando de verdad la abandona; mientras tanto, cada vez que vuelve se relee
  // el estado real contra el proveedor.
  useEffect(() => {
    const terminal = terminalStatusFor(screen);
    if (phase !== 'paying' || !terminal || terminal === 'expired' || closed.current === terminal) return;
    closed.current = terminal;

    if (terminal === 'settled') void refreshAssets();
    if (walletAddress && purchaseId) {
      void markPurchaseTerminal(walletAddress, purchaseId, terminal).catch(() => {
        // Que no se pueda cerrar sólo deja el registro pendiente de más; el
        // usuario ya tiene su USDC.
      });
    }
  }, [screen, phase, walletAddress, purchaseId, refreshAssets]);

  // Sólo vale el resultado del monto que está escrito ahora; el de cualquier
  // otro es de una tecla anterior y todavía se está recotizando.
  const fresh = result?.amount === amountFiat ? result : null;
  const quote = fresh?.quote ?? null;
  const error = fresh?.error ?? null;
  const quoting = amountValid && !!corridor && !fresh;

  const usdcOut = quote ? usdcOutOf(amountNum, quote) : null;
  // Una cotización fuera de límites SÍ vuelve con datos, así que el error es lo
  // que decide si se puede seguir, no la existencia de la cotización.
  const usable = !!quote && !error && !quoting;

  // Qué datos pide el proveedor lo define la cotización elegida: no hay ningún
  // campo boliviano cableado acá. Si la ruta no pide nada, el paso queda vacío y
  // el botón habilitado, que es exactamente lo que corresponde.
  const fields: RampField[] = quote?.requiredFields ?? [];
  const fieldsValid = fieldsAreValid(fields, values);

  /**
   * Trustline → compra → registro → QR, en ese orden y sin saltearse ninguno.
   *
   * La trustline va PRIMERO porque es la única falla que le cuesta plata al
   * usuario: un QR emitido contra una wallet que no puede recibir USDC se paga
   * igual, con bolivianos reales, y el proveedor no tiene dónde acreditar. Si
   * falla, no se crea nada.
   */
  const handleBuy = async () => {
    if (!quote || !corridor || !walletAddress || busy) return;
    setBusy(true);
    setFailure(null);
    setUnrecorded(false);
    try {
      setStep('trustline');
      await ensureUsdcTrustline(walletAddress);
      await refreshAssets();

      setStep('creating');
      const created = await createOnramp({ corridor, quote, amountFiat: amountNum, walletAddress, values });

      // El KYC del proveedor se resuelve en otra pantalla; hasta que exista, lo
      // honesto es decir que la compra no puede seguir por acá.
      if (created.kycRequired) {
        setFailure(t('wallet.fiat.onramp.err.kycRequired', 'The provider needs to verify your identity first.'));
        return;
      }

      const read = readPaymentInstructions(created);
      setTxId(created.txId);
      setProviderStatus('pending');
      setProviderAmount(null);
      setPaid({ amount: amountFiat, currency: corridor.currency });
      setEstimate(usdcOut);
      closed.current = null;

      // El registro va ANTES de mostrar el QR: sin el id de transacción guardado
      // no hay forma de volver a esta pantalla. Que falle no puede esconder un
      // código que el proveedor ya emitió y que el usuario puede pagar — el USDC
      // llega igual; lo que se pierde es poder retomar la pantalla.
      try {
        const recorded = await recordPurchase(walletAddress, {
          providerTxId: created.txId,
          provider: created.provider,
          country: corridor.country,
          amountFiat,
          currency: corridor.currency,
          expiresAt: read.expiresAt?.toISOString() ?? null,
        });
        setPurchaseId(recorded);
        if (!recorded) setUnrecorded(true);
      } catch {
        setUnrecorded(true);
      }

      setInstructions(read);
      setNow(new Date());
      setPhase('paying');
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      setStep(null);
      setBusy(false);
    }
  };

  /**
   * Vuelve al monto para pedir un código nuevo, con cotización fresca.
   *
   * Acá SÍ se cierra la compra vieja: pedir un código nuevo es abandonar el
   * anterior, y dejarlo abierto haría que la próxima vez que el usuario entre le
   * aparezca un QR que ya decidió no pagar.
   */
  const restart = () => {
    const closing = terminalStatusFor(screen) ?? 'expired';
    if (walletAddress && purchaseId) {
      void markPurchaseTerminal(walletAddress, purchaseId, closing).catch(() => {});
    }
    setTxId(null);
    setPurchaseId(null);
    setProviderStatus(null);
    setProviderAmount(null);
    setPaid(null);
    setEstimate(null);
    closed.current = null;
    setInstructions(null);
    setUnrecorded(false);
    setFailure(null);
    setResult(null);
    setRequote((n) => n + 1);
    setPhase('amount');
  };

  const footer =
    phase === 'paying' ? null : phase === 'amount' ? (
      <PressableButton variant="success" size="cta" onClick={() => setPhase('details')} disabled={!usable || !!corridorOff}>
        {t('wallet.fiat.onramp.continue', 'Continue')}
      </PressableButton>
    ) : (
      <PressableButton
        variant="success"
        size="cta"
        onClick={() => void handleBuy()}
        disabled={!fieldsValid || !usable || busy || !walletAddress}
      >
        {busy ? t('wallet.fiat.onramp.working', 'Preparing your purchase…') : t('wallet.fiat.onramp.cta', 'Buy USDC')}
      </PressableButton>
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.fiat.onramp.title', 'Buy USDC in {{country}} ({{currency}})', {
        country: countryName,
        currency: currency || country,
      })}
      size="md"
      // Con el QR en pantalla no hay vuelta atrás: el código ya existe del lado
      // del proveedor y "volver" sólo llevaría a crear otro sobre el mismo pago.
      onBack={phase === 'paying' ? undefined : phase === 'details' ? () => setPhase('amount') : onBack}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={footer}
    >
      {phase !== 'paying' && corridorOff && (
        <p className="rounded-md border border-black border-b-2 bg-[#FFF4DD] px-3 py-2 text-xs font-semibold text-black">
          {corridorOff}
        </p>
      )}

      {/* --- Monto en MONEDA LOCAL: es la unidad con la que cotizan los endpoints
          de ramps, y es lo que el usuario va a pagar desde el banco. --- */}
      {phase === 'amount' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500" htmlFor="onramp-amount">
            {t('wallet.fiat.onramp.amountLabel', 'How much do you want to spend?')}
          </label>
          <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-lg font-bold text-black">{symbol}</span>
            <input
              id="onramp-amount"
              type="text"
              inputMode="decimal"
              value={amountFiat}
              onChange={(e) => setAmountFiat(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
              placeholder="0.00"
              className={RAMP_FIELD_CLASS}
            />
            <span className="shrink-0 text-sm font-semibold text-gray-500">{currency}</span>
          </div>
          <p className="text-xs text-gray-500">{t('wallet.fiat.onramp.hint', 'You pay a QR code with your bank app.')}</p>
        </div>
      )}

      {phase !== 'paying' && resuming && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Spinner size="sm" color="current" /> {t('wallet.fiat.onramp.resuming', 'Checking for a purchase in progress…')}
        </p>
      )}

      {phase !== 'paying' && quoting && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Spinner size="sm" color="current" /> {t('wallet.fiat.onramp.quoting', 'Finding a route…')}
        </p>
      )}

      {/* --- Ruta elegida. Se muestra aunque el monto esté fuera de límites: el
          usuario necesita ver la comisión y el mínimo para corregirlo. --- */}
      {phase !== 'paying' && quote && !quoting && (
        <div className="flex flex-col gap-1 rounded-lg border border-black border-b-2 bg-white p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-black">{quote.provider}</span>
            <span className="text-xs font-semibold text-gray-500">{quote.rail}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.youPay', 'You pay')}</span>
            <span className="font-semibold text-black">
              {symbol} {amountNum} {currency}
            </span>
          </div>
          {usdcOut != null && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.onramp.youReceive', 'You receive')}</span>
              <span className="font-semibold text-black">
                {t('wallet.fiat.onramp.outUsdc', '≈ {{amount}} USDC', { amount: usdcLabel(usdcOut) })}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.rateLabel', 'Rate')}</span>
            <span className="font-semibold text-black">
              {quote.rate} {currency} / USDC
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.feeLabel', 'Fee')}</span>
            <span className="font-semibold text-black">{quote.fee}%</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.etaLabel', 'Estimated time')}</span>
            <span className="font-semibold text-black">{quote.estimatedTime}</span>
          </div>
          {(quote.minAmount != null || quote.maxAmount != null) && (
            <p className="pt-1 text-[11px] text-gray-400">
              {t('wallet.fiat.onramp.limits', 'Between {{min}} and {{max}} {{currency}}.', {
                min: quote.minAmount ?? '—',
                max: quote.maxAmount ?? '—',
                currency,
              })}
            </p>
          )}
        </div>
      )}

      {/* --- Datos que pide el proveedor para esta ruta. --- */}
      {phase === 'details' && (
        <RampFieldList
          fields={fields}
          values={values}
          onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
          disabled={busy}
          idPrefix="onramp"
        />
      )}

      {/* --- Pantalla de pago: el QR y los datos del proveedor. --- */}
      {phase === 'paying' && instructions && (screen === 'paying' || screen === 'expired') && (
        <OnrampQrScreen
          payload={instructions.payload}
          imageSrc={instructions.imageSrc}
          fields={instructions.fields}
          expiresAt={instructions.expiresAt}
          now={now}
          onRestart={restart}
        />
      )}

      {/* --- Después de pagar: acreditando, acreditada o rechazada. --- */}
      {phase === 'paying' && (screen === 'processing' || screen === 'settled' || screen === 'failed') && (
        <OnrampStatusScreen
          screen={screen}
          receivedUsdc={receivedUsdc}
          amountFiat={paid?.amount ?? amountFiat}
          currency={paid?.currency ?? currency}
          onDone={onOpenChange}
          onRestart={restart}
        />
      )}

      {unrecorded && (
        <p className="rounded-md border border-black border-b-2 bg-[#FFF4DD] px-3 py-2 text-xs font-semibold text-black">
          {t(
            'wallet.fiat.onramp.unrecorded',
            'Keep this screen open: we could not save your purchase, so you may not be able to return to it.',
          )}
        </p>
      )}

      {step && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Spinner size="sm" color="current" />{' '}
          {step === 'trustline'
            ? t('wallet.fiat.onramp.stepTrustline', 'Preparing your wallet to receive USDC…')
            : t('wallet.fiat.onramp.stepCreating', 'Asking the provider for your payment code…')}
        </p>
      )}

      {failure && <p className="text-sm font-medium text-red-600">{failure}</p>}

      {phase !== 'paying' && error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </AppModal>
  );
}
