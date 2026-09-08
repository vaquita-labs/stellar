'use client';

import { type PaymentInstructions, readPaymentInstructions } from '@/networks/pollar/onrampPayment';
import {
  type OnrampScreen,
  receivedUsdcFrom,
  resumeActionFor,
  screenFor,
  shouldPoll,
  terminalStatusFor,
} from '@/networks/pollar/onrampFlow';
import {
  fetchPendingPurchase,
  markPurchaseTerminal,
  recordPurchase,
  type TerminalPurchaseStatus,
} from '@/networks/pollar/onrampApi';
import { isKycRequiredError, kycNeededBy, waitForKycApproval } from '@/networks/pollar/kycWait';
import { fieldsAreValid, type RampField, rampErrorMessage, selectDefaults } from '@/networks/pollar/rampFields';
import { type OnrampCorridor, type OnrampCorridorCode, useRampOnramp, usdcOutOf } from '@/networks/pollar/rampsOnramp';
import type { RampQuote, RampTxStatus } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { Spinner } from '@heroui/react';
import { FiChevronDown } from 'react-icons/fi';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { railLabel } from '../../../helpers/rampRail';
import { FIAT_DECIMALS, formatTokenPrecise } from '../../../helpers/numbers';
import { useAwaitingFundsStore, usePendingCreditStore, useRampActiveStore } from '../../../stores';
import { AmountStep } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { OnrampQrScreen } from './OnrampQrScreen';
import { OnrampStatusScreen } from './OnrampStatusScreen';
import { OnrampVerifyScreen } from './OnrampVerifyScreen';
import { RampFieldList } from './RampFieldList';

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

/**
 * Elegir cuánto gastar, los datos que pida el proveedor, y pagar el QR.
 * `verifying` se cuela entre los datos y el QR cuando el proveedor no vende
 * hasta haber verificado al usuario.
 */
type Phase = 'amount' | 'details' | 'verifying' | 'paying';

/** Decimales con los que se muestra el USDC estimado. */
const usdcLabel = (amount: number) => (Math.floor(amount * 100) / 100).toFixed(2);

/**
 * The share of the purchase at which the fee stops being a detail and becomes the
 * headline. Above it the line turns amber and adds that larger amounts carry it
 * far better, which is the only thing the buyer can act on.
 */
const FEE_HEAVY_SHARE = 0.15;

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
  const { resolveCorridor, quoteFiat, ensureUsdcTrustline, createOnramp, readOnrampTransaction, readKycStatus } =
    useRampOnramp();
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
  // Verificación de identidad: el link del proveedor cuando publica uno, y si se
  // dejó de esperar por haber tardado demasiado.
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [kycTimedOut, setKycTimedOut] = useState(false);
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
  // Whether the fee breakdown is open. It stays open across keystrokes on
  // purpose: someone who opened it did so to watch the fee move with the amount,
  // and collapsing it on every key would take that away.
  const [feeOpen, setFeeOpen] = useState(false);
  const [typedValues, setValues] = useState<Record<string, string>>({});
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
  // The corridor's floor. Below it nothing is quoted: the provider returns no
  // route, and an empty list carries no amount to show, so the message naming
  // the amount that does work comes from here.
  const minFiat = corridor?.minFiat ?? 0;
  const typedAmount = !!amountFiat && Number.isFinite(amountNum) && amountNum > 0;
  const belowMin = typedAmount && amountNum < minFiat;
  const amountValid = typedAmount && !belowMin;

  // El fallback lo pone quien llama porque el mismo fallo dice cosas distintas
  // según dónde ocurra: cotizando todavía no hay compra, y creándola la
  // cotización ya salió bien.
  const messageOf = (e: unknown, fallback: string): string =>
    rampErrorMessage(e, (leaf) => t(`wallet.fiat.onramp.err.${leaf}`), fallback);

  const quoteFailed = () => t('wallet.fiat.onramp.err.generic', 'The purchase could not be quoted.');
  const buyFailed = () => t('wallet.fiat.onramp.err.buyFailed', 'We could not start your purchase. Try again.');

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
          setResult({ amount, quote: null, error: messageOf(e, quoteFailed()) });
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
  //
  // Un código vencido que el proveedor confirma sin pagar no se muestra: se
  // cierra acá y el usuario aparece en el monto, con el suyo ya escrito y la
  // cotización de ahora cargando. La compra nueva NO se crea sola —un código
  // vencido no prueba que nadie lo pagó, y el que pagó sobre la hora pagaría dos
  // veces con bolivianos de verdad—, así que el último paso lo da él.
  useEffect(() => {
    if (!open || !walletAddress) return;
    let cancelled = false;
    void (async () => {
      setResuming(true);
      try {
        const found = await fetchPendingPurchase(walletAddress);
        if (cancelled || !found) return;
        // El fallo de esta consulta no puede tirar abajo el rescate: sin
        // respuesta del proveedor no se cierra nada y la compra sigue en pie.
        const tx = await readOnrampTransaction(found.purchase.providerTxId).catch(() => null);
        if (cancelled) return;

        if (resumeActionFor({ state: found.state, providerStatus: tx?.status ?? null }) === 'restart') {
          void markPurchaseTerminal(walletAddress, found.purchase.id, 'expired').catch(() => {
            // Que no cierre sólo deja la fila abierta un rato más; el barrido de
            // la lectura la termina cerrando.
          });
          setAmountFiat(found.purchase.amountFiat);
          return;
        }

        setPurchaseId(found.purchase.id);
        setTxId(found.purchase.providerTxId);
        setPaid({ amount: found.purchase.amountFiat, currency: found.purchase.currency });

        if (!tx) {
          // Sin proveedor no hay QR que dibujar, pero la pantalla de vencida no
          // lo necesita: alcanza con el vencimiento que ya guardó el servidor.
          if (!found.purchase.expiresAt) return;
          setInstructions({ payload: null, imageSrc: null, fields: [], expiresAt: new Date(found.purchase.expiresAt) });
        } else {
          setProviderStatus(tx.status);
          setProviderAmount({ amount: tx.amount, currency: tx.currency });
          setInstructions(readPaymentInstructions(tx));
        }
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

  // Mientras la pantalla de verificación está abierta se le pregunta al
  // proveedor por la aprobación. Deja de preguntar apenas la pantalla se cierra
  // o el usuario se va a otro paso: el efecto se limpia y el ciclo corta solo.
  useEffect(() => {
    if (!open || phase !== 'verifying') return;
    let cancelled = false;
    void (async () => {
      const outcome = await waitForKycApproval({ readStatus: readKycStatus, shouldStop: () => cancelled });
      if (cancelled) return;
      if (outcome === 'timeout') {
        setKycTimedOut(true);
        return;
      }
      if (outcome === 'approved') {
        // La cotización venció mientras duraba el trámite —valen 15 minutos— así
        // que se pide una nueva sobre el mismo monto y el usuario confirma la
        // compra con el precio de ahora. No se compra sola: es plata suya.
        setRequote((n) => n + 1);
        setPhase('details');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, phase, readKycStatus]);

  // Qué pantalla corresponde sale de una sola función pura sobre lo que dijo el
  // proveedor y el reloj: acá no se decide nada.
  const expiresAt = instructions?.expiresAt ?? null;
  const screen: OnrampScreen = screenFor({ providerStatus, expiresAt, now });

  // El pago ya está confirmado y la pantalla lo dice, pero el USDC entra
  // después: hasta que llegue, el saldo del header muestra un número que
  // sabemos viejo. La marca lo pone a parpadear —plata en vuelo, no un error— y
  // la apaga `AutoInvest` cuando la plata aterriza y ofrece el vault pasivo.
  // Se prende también en `settled` porque el proveedor da la compra por
  // acreditada antes de que el balance on-chain que lee el header la vea.
  const startPendingCredit = usePendingCreditStore((s) => s.startPendingCredit);
  useEffect(() => {
    if (!open || phase !== 'paying') return;
    if (screen !== 'processing' && screen !== 'settled') return;
    startPendingCredit();
  }, [open, phase, screen, startPendingCredit]);
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
  // Our own floor outranks whatever the quote said: for an amount that was
  // never quoted, it is the only thing known about it.
  const error = belowMin
    ? t('wallet.fiat.onramp.minAmount', 'The minimum purchase is {{amount}} {{currency}}.', {
        amount: minFiat,
        currency,
      })
    : (fresh?.error ?? null);
  const quoting = amountValid && !!corridor && !fresh;

  const usdcOut = quote ? usdcOutOf(amountNum, quote) : null;
  // Una cotización fuera de límites SÍ vuelve con datos, así que el error es lo
  // que decide si se puede seguir, no la existencia de la cotización.
  const usable = !!quote && !error && !quoting;

  /**
   * What the fee weighs against the purchase, as a fraction.
   *
   * The fee is ALREADY INSIDE `rate` — `amountFiat / rate` is what the provider
   * credited, checked against a real purchase — so this is disclosure, never a
   * subtraction. Taking it off `usdcOut` would charge it twice.
   *
   * It is worth saying out loud because the fee carries a fixed part: it is
   * cents on a large purchase and half the money on a tiny one, and the buyer
   * has no other way to see that.
   */
  const feeShare = quote && quote.fee > 0 && amountNum > 0 ? quote.fee / amountNum : null;
  const feeHeavy = feeShare != null && feeShare >= FEE_HEAVY_SHARE;
  const feeAmount = quote ? `${symbol} ${formatTokenPrecise(quote.fee, FIAT_DECIMALS)}` : '';
  // One decimal below 10%, whole numbers above: "0.9%" and "1.8%" lose their
  // point rounded to "1%" and "2%", and "51.0%" says nothing "51%" does not.
  const feePercent =
    feeShare == null
      ? ''
      : (feeShare * 100 >= 10 ? Math.round(feeShare * 100) : Math.round(feeShare * 1000) / 10).toLocaleString();

  /**
   * The single line under the figure, always occupied (the error overrides it
   * inside `AmountStep`). In order: that a quote is being fetched, how much USDC
   * lands, and with nothing typed, how the purchase is paid.
   *
   * What lands goes HERE and not in a row of its own: it is what the buyer is
   * waiting to see while typing, and a row that appears and disappears with
   * every key pushes the keypad out from under their thumb.
   *
   * Unlike the withdrawal, this line never shows "1 USDC ≈ X". The on-ramp rate
   * moves with the amount — the fixed part of the fee weighs differently on 2
   * than on 1000 — so away from a concrete amount it means nothing.
   */
  const amountHint = quoting
    ? t('wallet.fiat.onramp.calculating', 'Calculating…')
    : usdcOut != null
      ? t('wallet.fiat.onramp.receiveEstimate', 'You get ≈ {{amount}} USDC', { amount: usdcLabel(usdcOut) })
      : t('wallet.fiat.onramp.hint', 'You pay a QR code with your bank app.');

  // Qué datos pide el proveedor lo define la cotización elegida: no hay ningún
  // campo boliviano cableado acá. Si la ruta no pide nada, el paso queda vacío y
  // el botón habilitado, que es exactamente lo que corresponde.
  const fields = useMemo<RampField[]>(() => quote?.requiredFields ?? [], [quote]);
  /**
   * Lo que el formulario muestra y manda: lo tipeado más el default de cada
   * select obligatorio que todavía está vacío (ver `selectDefaults`).
   *
   * El default entra en los valores y no sólo en lo que se ve porque el
   * Continuar los mira: uno puramente visual dejaría el banco elegido en
   * pantalla y el botón gris. Y se deriva en el render en vez de escribirse con
   * un efecto para que el estado siga guardando sólo lo que el usuario tipeó
   * —el `onChange` de la lista significa "lo editó él", y en el retiro eso
   * despega el formulario de la cuenta guardada.
   */
  const values = useMemo(() => ({ ...typedValues, ...(selectDefaults(fields, typedValues) ?? {}) }), [fields, typedValues]);
  const fieldsValid = fieldsAreValid(fields, values);

  /**
   * Manda al usuario a verificarse: abre el link del proveedor si publica uno, y
   * en los dos casos deja la pantalla esperando la aprobación.
   *
   * Abrir el link acá y no en un efecto es a propósito: sale del click del
   * usuario, que es lo único que el navegador no bloquea como popup.
   */
  const startVerification = (url: string | null) => {
    setKycUrl(url);
    setKycTimedOut(false);
    setFailure(null);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setPhase('verifying');
  };

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

      const need = kycNeededBy(created);
      if (need) {
        startVerification(need.url);
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
      // Pollar contesta lo mismo de dos formas: un 200 con `kycRequired` o este
      // error. Las dos van a la pantalla de verificación, no a un error.
      if (isKycRequiredError(e)) startVerification(null);
      else setFailure(messageOf(e, buyFailed()));
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
   *
   * `closing` es con qué queda registrada la que se abandona, y no sale siempre
   * de la pantalla: el usuario que cancela un código todavía vivo no lo dejó
   * vencer, y contar las dos cosas juntas taparía cuál de los dos problemas
   * tenemos.
   */
  const restartWith = (closing: TerminalPurchaseStatus) => {
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
    setKycUrl(null);
    setKycTimedOut(false);
    setFailure(null);
    setResult(null);
    setRequote((n) => n + 1);
    setPhase('amount');
  };

  /** Abandonar por donde venía la pantalla: vencida, rechazada o acreditada. */
  const restart = () => restartWith(terminalStatusFor(screen) ?? 'expired');

  /** Abandonar un código que todavía servía, porque el usuario lo pidió. */
  const cancel = () => restartWith('cancelled');

  // El formulario (monto, cotización, campos) es de los dos primeros pasos; en la
  // verificación y en el pago la pantalla es otra y no debe quedar nada suyo
  // asomando debajo.
  const showForm = phase === 'amount' || phase === 'details';

  const footer =
    phase !== 'amount' && phase !== 'details' ? null : phase === 'amount' ? (
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

  /**
   * What goes between the figure and the keypad while typing — a purchase being
   * recovered, and the fee of the quote in hand — plus, only on the details step,
   * the route already quoted. It is drawn in a different place per step, so it
   * lives in a variable instead of being repeated.
   *
   * The full breakdown is NOT shown on the amount step: it is exactly the one on
   * the next step, where the buyer has it in front of them right before paying.
   * Repeating it while they type only pushes the keypad down with a number that
   * changes on every key.
   */
  const routeCard = (
    <>
      {showForm && resuming && (
        <p className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <Spinner size="sm" color="current" /> {t('wallet.fiat.onramp.resuming', 'Checking for a purchase in progress…')}
        </p>
      )}

      {/* --- The fee, folded away on the amount step. The figure itself is on the
          breakdown of the step right before paying, so this is the same number
          brought forward for whoever wants it while still choosing how much.
          "Includes" is deliberate: the fee is already inside what is paid,
          neither added to it nor taken off it. --- */}
      {phase === 'amount' && feeShare != null && !quoting && (
        <div className="flex flex-col items-center gap-1 text-center">
          <button
            type="button"
            onClick={() => setFeeOpen((open) => !open)}
            className="flex items-center gap-1 text-xs font-semibold text-gray-500"
          >
            {feeOpen ? t('wallet.fiat.onramp.feeHide', 'Hide detail') : t('wallet.fiat.onramp.feeShow', 'See detail')}
            <FiChevronDown className={`h-3.5 w-3.5 transition-transform ${feeOpen ? 'rotate-180' : ''}`} />
          </button>
          {feeOpen && (
            <p className={`text-xs ${feeHeavy ? 'text-amber-600' : 'text-gray-500'}`}>
              {t('wallet.fiat.onramp.feeIncluded', 'Includes {{amount}} in fees: {{percent}}% of your purchase.', {
                amount: feeAmount,
                percent: feePercent,
              })}
              {feeHeavy ? ` ${t('wallet.fiat.onramp.feeHeavy', 'It weighs far less on larger amounts.')}` : ''}
            </p>
          )}
        </div>
      )}

      {/* --- The chosen route, on the step right before paying: what you pay,
          what you get, at what rate and how long it takes. --- */}
      {phase === 'details' && quote && !quoting && (
        <div className="flex flex-col gap-1 rounded-lg border border-black border-b-2 bg-white p-3 text-sm">
          {/* El nombre del proveedor no se muestra: el usuario paga por un
              rail (QR, transferencia), y quién lo liquida es un detalle
              nuestro. El rail va con el nombre que la gente conoce, no con la
              sigla que manda el proveedor. */}
          <div className="flex items-center justify-between">
            <span className="font-bold text-black">{t('wallet.fiat.onramp.routeLabel', 'Payment method')}</span>
            <span className="text-xs font-semibold text-gray-500">{railLabel(quote.rail, t)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.youPay', 'You pay')}</span>
            <span className="font-semibold text-black">
              {symbol} {amountNum} {currency}
            </span>
          </div>
          {feeShare != null && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.onramp.feeLabel', 'Includes fee')}</span>
              <span className={`font-semibold ${feeHeavy ? 'text-amber-600' : 'text-black'}`}>
                {t('wallet.fiat.onramp.feeValue', '{{amount}} · {{percent}}%', {
                  amount: feeAmount,
                  percent: feePercent,
                })}
              </span>
            </div>
          )}
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
              {formatTokenPrecise(quote.rate, FIAT_DECIMALS)} {currency} / USDC
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.etaLabel', 'Estimated time')}</span>
            <span className="font-semibold text-black">{quote.estimatedTime}</span>
          </div>
          {/* Los límites de la ruta no van acá sino en la línea bajo el monto:
              son lo que le dice al usuario cómo arreglar un monto que no entra,
              y ahí los lee mientras tipea. */}
        </div>
      )}
    </>
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
      // Regla de todos los flujos de plata: no se cierran tocando afuera en
      // NINGÚN paso. Con el QR en pantalla pesa doble — el usuario está yendo y
      // viniendo a la app del banco con el código a la vista, y un toque al
      // borde le tapa la pantalla justo cuando la necesita. La X y "volver a
      // empezar" siguen ahí, que son cierres deliberados.
      isDismissable={false}
      // Con el QR en pantalla no hay vuelta atrás: el código ya existe del lado
      // del proveedor y "volver" sólo llevaría a crear otro sobre el mismo pago.
      onBack={
        phase === 'paying'
          ? undefined
          : phase === 'details'
            ? () => setPhase('amount')
            : // Desde la verificación se vuelve a los datos, no al selector de
              // país: el usuario ya eligió dónde compra y rehacer ese camino no
              // adelanta el trámite.
              phase === 'verifying'
              ? () => setPhase('details')
              : onBack
      }
      // Con el teclado en el cuerpo, el aire de las otras fases hace scrollear el
      // sheet en pantallas chicas y lo primero que se corta es el monto.
      bodyClassName={`flex flex-col pb-2 ${phase === 'amount' ? 'gap-2.5' : 'gap-4'}`}
      footer={footer}
    >
      {showForm && corridorOff && (
        <p className="rounded-md border border-black border-b-2 bg-[#FFF4DD] px-3 py-2 text-xs font-semibold text-black">
          {corridorOff}
        </p>
      )}

      {/* --- Monto en MONEDA LOCAL: es la unidad con la que cotizan los endpoints
          de ramps, y es lo que el usuario va a pagar desde el banco. Mientras se
          teclea, la ruta va ENTRE el número y el teclado: es justo lo que cambia
          al escribir, así que queda a la vista de los dos. En el paso de datos ya
          no hay teclado y la misma ruta se muestra sola. --- */}
      {phase === 'amount' ? (
        <AmountStep
          value={amountFiat}
          onValueChange={setAmountFiat}
          // Dos decimales, no los 7 del USDC: centavos de boliviano es todo lo
          // que el proveedor cotiza, y es la misma precisión del tipo de cambio.
          decimals={FIAT_DECIMALS}
          symbol={symbol || currency}
          symbolPosition="suffix"
          error={error}
          hint={amountHint}
          // Sin chip de saldo —la plata sale del banco, no de acá— y sin tope:
          // `maxAmount` llega recién con la cotización, así que un tope acá
          // aparecería a mitad de tipear y las teclas dejarían de responder sin
          // decir por qué. El monto fuera de rango lo explica `limitProblem`.
        >
          {routeCard}
        </AmountStep>
      ) : (
        routeCard
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

      {/* --- La compra está frenada hasta que el proveedor verifique al usuario. --- */}
      {phase === 'verifying' && (
        <OnrampVerifyScreen
          url={kycUrl}
          timedOut={kycTimedOut}
          onOpen={() => kycUrl && window.open(kycUrl, '_blank', 'noopener,noreferrer')}
          onRestart={restart}
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
          onCancel={cancel}
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

      {/* En el paso del monto el error ya se muestra debajo del número, que es
          donde el usuario está mirando; acá abajo sería el mismo texto dos veces
          y encima tapado por el teclado. */}
      {phase === 'details' && error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </AppModal>
  );
}
