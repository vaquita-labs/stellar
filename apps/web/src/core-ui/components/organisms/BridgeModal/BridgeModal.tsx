'use client';

import { Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiArrowDown, FiCheck, FiCheckCircle, FiCopy, FiXCircle } from 'react-icons/fi';
import QRCode from 'react-qr-code';
import {
  isBridgeTerminal,
  useAttachDepositTx,
  useBridgeQuote,
  useBridgeTransfer,
  useCreateBridgeTransfer,
  type BridgeDirection,
  type BridgeQuote,
  type BridgeTransfer,
} from '@/core-ui/hooks/useBridge';
import { useUsdcTrustline } from '@/core-ui/hooks/useUsdcTrustline';
import { blendConfigForToken, resolveMemo, sponsoredUsdcPayment } from '@/networks/stellar/blendDirect';
import { truncatedAmountString } from '../../../helpers/numbers';
import { truncateMiddle } from '../../../helpers/strings';
import { humanizeTxError } from '../../../helpers/txError';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface BridgeModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Dirección Stellar del usuario. Es SIEMPRE una de las dos puntas. */
  stellarWallet: string | null;
}

/** Límites del endpoint (`routes/bridge/route.ts`): repetirlos evita un viaje. */
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100_000;

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Decimales del USDC que RECIBE cada dirección: Stellar 7, Base 6. */
const DESTINATION_DECIMALS: Record<BridgeDirection, number> = {
  evm_to_stellar: 7,
  stellar_to_evm: 6,
};

/** Recorta el input a un número con como mucho `decimals` decimales. */
const sanitizeAmount = (raw: string, decimals: number): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, decimals)}`;
};

/**
 * Pasa unidades base a humanas SIN float en el medio: el monto que llega es lo
 * que el usuario va a comparar contra su exchange, y `Number()` sobre 7
 * decimales ya empieza a mentir en el último dígito.
 */
const formatBaseUnits = (raw: string | null, decimals: number): string | null => {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
};

/**
 * Qué se está esperando, por estado de 1Click.
 *
 * Son fases distintas y hay que decirlo: en `PENDING_DEPOSIT` la pelota la
 * tiene el usuario, en las otras dos no hay nada que hacer más que esperar.
 * Antes las tres caían en dos mensajes repartidos por una lista `AWAITING` que
 * además metía `INCOMPLETE_DEPOSIT` —que NO es una espera, es un error que
 * pide acción— en la misma bolsa que la espera normal.
 */
export const WAITING_PHASE: Record<string, { key: string; fallback: string }> = {
  PENDING_DEPOSIT: { key: 'wallet.bridge.waitingDeposit', fallback: 'Waiting for your deposit…' },
  KNOWN_DEPOSIT_TX: {
    key: 'wallet.bridge.confirmingDeposit',
    fallback: 'Deposit received — confirming on the network…',
  },
  PROCESSING: { key: 'wallet.bridge.processing', fallback: 'Bridging your USDC…' },
};

/**
 * `m:ss`, y `h:mm:ss` si de verdad se fue de las manos.
 *
 * El transcurrido es lo único que separa "está trabajando" de "se colgó". La
 * primera transferencia real en prod tardó ~7m52s contra los 50 s que cotiza
 * 1Click, así que un spinner pelado se lee como pantalla rota mucho antes de
 * que la operación tenga algo malo.
 */
export const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours === 0) return `${minutes}:${seconds}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
};

/**
 * Puente de USDC entre Base y Stellar, liquidado por NEAR Intents 1Click.
 *
 * Reemplaza al viejo `BridgeUsdcModal` (CCTP): aquel armaba calldata de EVM a
 * mano contra `window.ethereum`, esperaba la atestación de Circle y necesitaba
 * un relayer con secreto caliente. Acá no hay nada de eso — 1Click devuelve una
 * DIRECCIÓN DE DEPÓSITO y el puente es, del lado del usuario, un envío común:
 *
 * - **Base → Stellar**: se muestra la `0x…` con QR y el usuario la fondea desde
 *   la wallet o el exchange que ya usa. No hay wallet de EVM que conectar, ni
 *   firma, ni librería de EVM en el bundle.
 * - **Stellar → Base**: 1Click devuelve una `G…` CON MEMO, y se paga con
 *   `sponsoredUsdcPayment` — pago clásico patrocinado, así funciona con 0 XLM.
 *   El memo es lo que identifica el depósito: sin él la plata llega sin dueño,
 *   por eso el envío se bloquea si no resuelve.
 *
 * El estado lo sigue el servidor en cada lectura; acá sólo se consulta la fila.
 */
export function BridgeModal({ open, onOpenChange, stellarWallet }: BridgeModalProps) {
  const { t } = useTranslation();
  const { token } = useConfigStore();
  const { walletBalance, refreshWalletBalance, setTrustline } = usePollar();

  const [direction, setDirection] = useState<BridgeDirection>('evm_to_stellar');
  const [amount, setAmount] = useState('');
  const [evmWallet, setEvmWallet] = useState('');
  // La cotización se guarda JUNTO CON las entradas que la produjeron. Así, en
  // cuanto el usuario toca el monto, la de antes deja de mostrarse sola — sin
  // un efecto que la borre, que es lo que dispara renders en cascada.
  const [quoteState, setQuoteState] = useState<{
    key: string;
    quote: BridgeQuote | null;
    error: string | null;
  } | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activating, setActivating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payNotice, setPayNotice] = useState<string | null>(null);
  /**
   * Hash del pago de salida apenas la wallet lo suelta, ANTES de que el server
   * lo sepa. Es lo que hace que el botón "Enviar" no vuelva si el POST de
   * `deposit-tx` falla: sin esto, un pago que ya salió quedaría con la fila sin
   * `sourceTxHash` y la UI ofrecería mandarlo de nuevo.
   */
  const [sentHash, setSentHash] = useState<string | null>(null);
  /** Vencimiento ya cumplido, puesto por el timer de abajo (ver `quoteExpired`). */
  const [expiredDeadline, setExpiredDeadline] = useState<number | null>(null);

  const quoteMutation = useBridgeQuote();
  const createTransfer = useCreateBridgeTransfer();
  const attachDepositTx = useAttachDepositTx();
  const { data: transfer } = useBridgeTransfer(transferId);

  const inbound = direction === 'evm_to_stellar';
  const usdcIssuer = blendConfigForToken(token)?.usdcIssuer;
  const decimals = inbound ? 6 : 7;

  // Limpiamos todo al cambiar la visibilidad (patrón "ajustar estado en render",
  // no un efecto): ni al abrir ni al cerrar arrastra una transferencia anterior.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setAmount('');
    setEvmWallet('');
    setQuoteState(null);
    setTransferId(null);
    setPayError(null);
    setPayNotice(null);
    setSentHash(null);
    setExpiredDeadline(null);
    setDirection('evm_to_stellar');
  }

  // Saldo del MISMO USDC que acepta Blend (mismo issuer): en testnet conviven
  // varios "USDC" y matchear sólo por código resuelve el que no es.
  const available = useMemo(() => {
    const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
    const usdc = usdcIssuer
      ? balances.find((b) => b.code?.toUpperCase() === 'USDC' && b.issuer === usdcIssuer)
      : undefined;
    return usdc ? Number(usdc.available) : 0;
  }, [walletBalance, usdcIssuer]);

  useEffect(() => {
    if (open) void refreshWalletBalance();
  }, [open, refreshWalletBalance]);

  // ¿Puede la wallet del usuario RECIBIR el USDC que va a traer? 1Click valida
  // la trustline al cotizar y rechaza con un 400; preguntarlo antes convierte
  // ese error en un botón que la activa.
  const trustline = useUsdcTrustline(inbound ? stellarWallet : null, usdcIssuer);
  const needsTrustline = inbound && (trustline.data === 'missing' || trustline.data === 'unfunded');

  const amountNum = Number(amount);
  const amountInRange = amount !== '' && amountNum >= MIN_AMOUNT && amountNum <= MAX_AMOUNT;
  const overBalance = !inbound && amountInRange && amountNum > available;
  const evmValid = EVM_ADDRESS_RE.test(evmWallet.trim());
  const inputsReady = amountInRange && evmValid && !overBalance && !!stellarWallet;

  const quoteKey = `${direction}|${amount}|${evmWallet.trim()}`;
  const currentQuote = quoteState?.key === quoteKey ? quoteState : null;
  const quote = currentQuote?.quote ?? null;
  const quoteError = currentQuote?.error ?? null;

  // Cotización en seco mientras el usuario escribe. Es `dry`, así que pedirla de
  // más no deja filas ni direcciones colgadas; el debounce es sólo para no
  // castigar la API en cada tecla.
  useEffect(() => {
    if (!inputsReady || needsTrustline) return;
    let active = true;
    const timer = setTimeout(() => {
      quoteMutation.mutate(
        { direction, amount, evmWallet: evmWallet.trim() },
        {
          onSuccess: (data) => {
            if (active) setQuoteState({ key: quoteKey, quote: data, error: null });
          },
          onError: (error) => {
            if (active) setQuoteState({ key: quoteKey, quote: null, error: error.message });
          },
        },
      );
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `quoteMutation` es estable por instancia de hook pero no por identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, inputsReady, needsTrustline]);

  /**
   * Lo que cuesta la operación, en plata y en porcentaje: entra menos sale.
   *
   * Reemplaza a `quote.withdrawFee`, que se mostraba crudo y era el número
   * equivocado dos veces. Viene en unidades base del activo de destino (1Click
   * devuelve `189711`, no `0.0190`, así que la pantalla decía "Network fee:
   * 189711") y además deja afuera los 10 bps de referral que 1Click inyecta
   * mientras no mandemos JWT. La resta no se equivoca en ninguna de las dos.
   *
   * El porcentaje importa porque el costo es casi todo fijo: a 1 USDC —el
   * mínimo que acepta el endpoint— se va el 2%, contra 0.13% a 100.
   */
  const quoteCost = useMemo(() => {
    if (!quote) return null;
    const sent = Number(quote.amountIn);
    const received = Number(quote.amountOut);
    if (!Number.isFinite(sent) || !Number.isFinite(received) || sent <= 0 || received > sent) return null;
    const cost = sent - received;
    return { amount: cost.toFixed(4), percent: ((cost / sent) * 100).toFixed(2) };
  }, [quote]);

  const handleMax = () => {
    if (available > 0) setAmount(truncatedAmountString(available, decimals));
  };

  const handleActivateTrustline = async () => {
    if (!usdcIssuer) return;
    setActivating(true);
    try {
      const outcome = await setTrustline({ code: 'USDC', issuer: usdcIssuer });
      if (outcome.status === 'error') throw new Error(outcome.details ?? 'trustline failed');
      await trustline.refetch();
    } catch {
      toast.danger(t('wallet.bridge.trustlineError', 'Could not activate USDC. Please try again.'));
    } finally {
      setActivating(false);
    }
  };

  /**
   * Emite la cotización EN FIRME. Es el único paso que crea una dirección de
   * depósito, y por eso el único que deja una fila: hasta acá nada existe.
   */
  const handleContinue = () => {
    if (!inputsReady) return;
    createTransfer.mutate(
      { direction, amount, evmWallet: evmWallet.trim() },
      {
        onSuccess: (row) => setTransferId(row.id),
        onError: (error) => toast.danger(error.message),
      },
    );
  };

  /**
   * Pata de salida: paga la dirección de depósito de 1Click con el memo que
   * vino con ella. Sin memo NO se envía — un depósito sin memo entra al puente
   * sin forma de saber a quién acreditarle, y recuperarlo es un ticket manual.
   */
  const handlePayFromStellar = async (row: BridgeTransfer) => {
    const memo = resolveMemo(row.depositMemo);
    if (!row.depositAddress || !memo) {
      setPayError(t('wallet.bridge.missingMemo', 'The bridge did not return a valid memo. Try again.'));
      return;
    }
    // Segunda reja, por si el footer alcanzó a renderizarse con el botón viejo:
    // la dirección de depósito de una cotización vencida ya no vale nada.
    if (quoteExpired) {
      setPayError(
        t(
          'wallet.bridge.quoteExpired',
          'This quote expired before it was paid. Get a new one — sending to the old address would lose the funds.',
        ),
      );
      return;
    }
    setPaying(true);
    setPayError(null);
    setPayNotice(null);
    try {
      const { hash } = await sponsoredUsdcPayment({ to: row.depositAddress, amount: row.amount, memo });
      // Antes de avisarle al server: a partir de acá la plata ya salió, pase lo
      // que pase con el POST de abajo.
      setSentHash(hash);
      await attachDepositTx.mutateAsync({ id: row.id, txHash: hash });
      await refreshWalletBalance();
    } catch (e) {
      const { title, pending, hash } = humanizeTxError(e, t);
      // La tx salió a la red y todavía puede confirmar. No es un fallo: volver a
      // ofrecer "Enviar" mandaría la misma plata dos veces a la misma dirección
      // de depósito. Guardamos el hash igual — la fila queda con `sourceTxHash`
      // y el poll se hace cargo — y si ni eso se puede, `sentHash` ya alcanza
      // para que el botón no vuelva.
      if (pending && hash) {
        setSentHash(hash);
        setPayNotice(
          t(
            'wallet.bridge.pendingConfirm',
            'Your payment was sent and is still confirming. We are tracking it — do not send it again.',
          ),
        );
        try {
          await attachDepositTx.mutateAsync({ id: row.id, txHash: hash });
        } catch {
          // 1Click detecta el depósito por su cuenta; avisarle sólo lo acelera.
        }
      } else {
        setPayError(title);
      }
    } finally {
      setPaying(false);
    }
  };

  /** Descarta una cotización vencida y vuelve al formulario. */
  const handleStartOver = () => {
    setTransferId(null);
    setQuoteState(null);
    setPayError(null);
    setPayNotice(null);
    setSentHash(null);
    setExpiredDeadline(null);
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bloqueado: el QR y el texto siguen ahí.
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const receivedAmount = transfer
    ? formatBaseUnits(transfer.amountOut, DESTINATION_DECIMALS[transfer.direction])
    : null;

  /** El pago de salida ya salió, lo sepa el server o no. */
  const alreadySent = !!transfer?.sourceTxHash || !!sentHash;

  /**
   * Cotización vencida y sin pagar. Pasado el `deadline` 1Click ya no honra esa
   * dirección de depósito, así que mandarle plata es perderla de vista.
   *
   * No se lee el reloj en el render (además de impuro, no dispararía nada
   * cuando el plazo se cumple con el modal quieto): un único timer avisa JUSTO
   * en el vencimiento, así que el botón desaparece en ese instante y no hay
   * ventana para pagar una cotización ya vencida.
   */
  const watchDeadline =
    !!transfer && transfer.direction === 'stellar_to_evm' && !alreadySent && !!transfer.deadline;
  const deadlineAt = watchDeadline ? transfer.deadline : null;
  const quoteExpired = deadlineAt !== null && expiredDeadline === deadlineAt;

  useEffect(() => {
    if (deadlineAt === null) return;
    // Si ya venció, el timeout de 0 ms igual corre después del render, así que
    // nunca se llama a setState en el cuerpo del efecto.
    const timer = setTimeout(() => setExpiredDeadline(deadlineAt), Math.max(0, deadlineAt - Date.now()));
    return () => clearTimeout(timer);
  }, [deadlineAt]);

  /**
   * Reloj de 1 s para el transcurrido, y SÓLO mientras hay algo en curso: en
   * cuanto la transferencia llega a un estado terminal el intervalo se corta
   * solo, igual que el poll de `useBridgeTransfer`.
   *
   * Como el resto del archivo, el reloj no se lee en el render — de ahí el
   * estado en vez de un `Date.now()` suelto.
   */
  const tracking = !!transfer && !isBridgeTerminal(transfer.status);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!tracking) return;
    // El primer tick va por `setTimeout` de 0 ms y no en el cuerpo del efecto,
    // igual que el timer del vencimiento de acá arriba: corre después del
    // render, así que no encadena uno nuevo. Hace falta porque `now` puede
    // venir de cuando se montó el modal, que es antes de que la transferencia
    // existiera.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [tracking]);

  const body = () => {
    if (!transfer) return formStep();
    if (transfer.status === 'SUCCESS') {
      return outcomeStep(
        'success',
        t('wallet.bridge.successTitle', 'Transfer complete'),
        t('wallet.bridge.successBody', '{{amount}} USDC arrived.', {
          amount: receivedAmount ?? transfer.amount,
        }),
      );
    }
    if (transfer.status === 'REFUNDED') {
      return outcomeStep(
        'error',
        t('wallet.bridge.refundedTitle', 'Transfer refunded'),
        t('wallet.bridge.refundedBody', 'The bridge sent the funds back to your refund address.'),
      );
    }
    if (transfer.status === 'FAILED') {
      return outcomeStep(
        'error',
        t('wallet.bridge.failedTitle', 'Transfer failed'),
        transfer.errorReason ?? t('wallet.bridge.failedBody', 'The bridge could not complete the swap.'),
      );
    }
    // Va antes del reparto por dirección: no es una pantalla de espera, es una
    // que pide acción, y sirve para las dos patas.
    if (transfer.status === 'INCOMPLETE_DEPOSIT') return incompleteDepositStep(transfer);
    return transfer.direction === 'evm_to_stellar' ? inboundStep(transfer) : outboundStep(transfer);
  };

  const formStep = () => (
    <>
      {/* Dirección: dos pestañas, no un selector de redes. Sólo hay un par. */}
      <div className="grid grid-cols-2 gap-2">
        {(['evm_to_stellar', 'stellar_to_evm'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setDirection(value);
              setAmount('');
            }}
            className={`rounded-lg border border-black px-3 py-2.5 text-sm font-semibold transition ${
              direction === value ? 'border-b-2 bg-[#DDF4FF] text-black' : 'bg-white text-gray-500 hover:bg-[#F5FBFF]'
            }`}
          >
            {value === 'evm_to_stellar'
              ? t('wallet.bridge.directionIn', 'Base → Stellar')
              : t('wallet.bridge.directionOut', 'Stellar → Base')}
          </button>
        ))}
      </div>

      {/* La wallet necesita trustline ANTES de cotizar: 1Click rechaza el quote
          sin ella, y el usuario no tiene por qué leer ese error crudo. */}
      {needsTrustline && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#F0B429] bg-[#FFF7E6] px-4 py-3">
          <p className="text-sm text-black">
            {t('wallet.bridge.trustlineNeeded', 'Your wallet needs to activate USDC before it can receive it.')}
          </p>
          <PressableButton variant="primary" size="md" onClick={handleActivateTrustline} disabled={activating}>
            {activating ? (
              <>
                <Spinner size="sm" color="current" />
                {t('wallet.bridge.activating', 'Activating…')}
              </>
            ) : (
              t('wallet.bridge.activateTrustline', 'Activate USDC')
            )}
          </PressableButton>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="bridge-amount" className="text-xs font-semibold text-gray-600">
            {t('wallet.bridge.amount', 'Amount')}
          </label>
          {!inbound && (
            <button type="button" onClick={handleMax} className="text-xs font-semibold text-[#0072B5]">
              {t('wallet.bridge.available', 'Available: {{amount}} USDC', { amount: available.toFixed(2) })}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-3">
          <input
            id="bridge-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeAmount(e.target.value, decimals))}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-black outline-none"
          />
          <span className="shrink-0 text-sm font-semibold text-gray-500">USDC</span>
        </div>
        {overBalance && (
          <p className="mt-1.5 text-xs text-danger">{t('wallet.bridge.insufficient', 'Not enough USDC.')}</p>
        )}
        {amount !== '' && !amountInRange && !overBalance && (
          <p className="mt-1.5 text-xs text-danger">
            {t('wallet.bridge.amountRange', 'Enter an amount between {{min}} and {{max}} USDC.', {
              min: MIN_AMOUNT,
              max: MAX_AMOUNT.toLocaleString(),
            })}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="bridge-evm" className="mb-1.5 block text-xs font-semibold text-gray-600">
          {inbound
            ? t('wallet.bridge.refundAddress', 'Your Base address (for refunds)')
            : t('wallet.bridge.destinationAddress', 'Destination address on Base')}
        </label>
        <input
          id="bridge-evm"
          value={evmWallet}
          onChange={(e) => setEvmWallet(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-black border-b-2 bg-white px-4 py-3 font-mono text-sm text-black outline-none"
        />
        {evmWallet.trim() !== '' && !evmValid && (
          <p className="mt-1.5 text-xs text-danger">
            {t('wallet.bridge.invalidEvmAddress', 'Enter a valid Base address (0x…).')}
          </p>
        )}
      </div>

      {/* Lo que se recibe se muestra ANTES de emitir la dirección: es la única
          pantalla en la que el usuario todavía puede decir que no. */}
      {quoteMutation.isPending && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Spinner size="sm" color="current" />
          {t('wallet.bridge.quoting', 'Getting quote…')}
        </p>
      )}
      {quoteError && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {quoteError}
        </p>
      )}
      {quote && !quoteMutation.isPending && (
        <dl className="flex flex-col gap-2 rounded-lg border border-black border-b-2 bg-[#F5FBFF] px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">{t('wallet.bridge.youReceive', 'You receive')}</dt>
            <dd className="font-semibold text-black">{quote.amountOut} USDC</dd>
          </div>
          {quoteCost && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">{t('wallet.bridge.fee', 'Network fee')}</dt>
              <dd className="text-black">
                {t('wallet.bridge.feeValue', '{{amount}} USDC ({{percent}}%)', {
                  amount: quoteCost.amount,
                  percent: quoteCost.percent,
                })}
              </dd>
            </div>
          )}
          {/* La estimación de 1Click (`quote.timeEstimate`) NO se muestra. Es
              una constante de la ruta, no un pronóstico: medida el 2026-09-08
              devolvió 50 s a 1, 5, 20 y 100 USDC, y la única transferencia real
              en prod tardó ~7m52s. Prometer 50 s y tardar 8 minutos es peor que
              no prometer nada. Cuando haya muestra propia —p90 de
              `updated_at - created_at` sobre las filas SUCCESS de
              `bridge_transfers`— acá va ese número, no el de ellos. */}
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">{t('wallet.bridge.eta', 'Estimated time')}</dt>
            <dd className="text-black">{t('wallet.bridge.etaRange', 'Usually a few minutes')}</dd>
          </div>
        </dl>
      )}
    </>
  );

  const inboundStep = (row: BridgeTransfer) => (
    <>
      <p className="text-sm text-gray-600">
        {t(
          'wallet.bridge.depositInstructions',
          'Send exactly {{amount}} USDC on the Base network to this address, from any wallet or exchange.',
          { amount: row.amount },
        )}
      </p>

      {/* `data-ph-block`: la dirección de depósito dibujada en píxeles, que el
          enmascarado de texto del replay no alcanza. */}
      <div data-ph-block className="mx-auto w-fit rounded-xl border border-black border-b-2 bg-white p-4">
        <QRCode
          value={row.depositAddress || ' '}
          size={180}
          bgColor="#ffffff"
          fgColor="#1a1a1a"
          className="h-[180px] w-[180px]"
        />
      </div>

      {addressRow(row.depositAddress ?? '')}

      <div className="flex items-start justify-center gap-1.5 text-xs text-gray-400">
        <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {t(
            'wallet.bridge.baseOnlyWarning',
            'Base network only, USDC only. Anything else sent to this address is lost.',
          )}
        </p>
      </div>

      {progressRow(row)}
    </>
  );

  const outboundStep = (row: BridgeTransfer) => (
    <>
      <p className="text-sm text-gray-600">
        {t('wallet.bridge.outboundInstructions', 'Confirm the payment to send {{amount}} USDC to Base.', {
          amount: row.amount,
        })}
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-black border-b-2 bg-[#F5FBFF] px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-gray-600">{t('wallet.bridge.toAddress', 'To')}</span>
          <span className="font-mono text-black">{truncateMiddle(row.destinationWallet, 8, 6)}</span>
        </div>
        {receivedAmount && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-600">{t('wallet.bridge.youReceive', 'You receive')}</span>
            <span className="font-semibold text-black">{receivedAmount} USDC</span>
          </div>
        )}
      </div>

      {quoteExpired && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t(
            'wallet.bridge.quoteExpired',
            'This quote expired before it was paid. Get a new one — sending to the old address would lose the funds.',
          )}
        </p>
      )}

      {payError && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {payError}
        </p>
      )}

      {payNotice && (
        <p className="flex items-start gap-1.5 text-xs text-gray-500">
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {payNotice}
        </p>
      )}

      {alreadySent ? progressRow(row) : null}
    </>
  );

  const addressRow = (value: string) => (
    <div className="flex w-full items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3">
      <span className="min-w-0 flex-1 break-all font-mono text-sm text-black">{value || '—'}</span>
      <button
        type="button"
        onClick={() => handleCopy(value)}
        disabled={!value}
        aria-label={t('wallet.bridge.copy', 'Copy')}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-xs font-semibold text-black transition hover:bg-[#c4ecff] active:translate-y-0.5 disabled:opacity-50"
      >
        {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
        {copied ? t('wallet.bridge.copied', 'Copied') : t('wallet.bridge.copy', 'Copy')}
      </button>
    </div>
  );

  const progressRow = (row: BridgeTransfer) => {
    // Un estado que no conocemos igual es una espera: 1Click puede sumar
    // estados, y quedarse sin mensaje es peor que caer en el genérico.
    const phase = WAITING_PHASE[row.status] ?? WAITING_PHASE.PROCESSING;
    return (
      <div className="flex flex-col items-center gap-1.5 text-xs text-gray-500">
        <div className="flex items-center justify-center gap-2">
          <Spinner size="sm" color="current" />
          <span>{t(phase.key, phase.fallback)}</span>
          <span className="font-mono tabular-nums text-gray-400">
            {formatElapsed(now - row.createdTimestamp)}
          </span>
        </div>
        <p className="text-center text-gray-400">
          {t(
            'wallet.bridge.keepsGoing',
            'This keeps going if you close this window. Reopen it any time to check.',
          )}
        </p>
      </div>
    );
  };

  /**
   * `INCOMPLETE_DEPOSIT`: llegó MENOS de lo cotizado, así que el swap no
   * arrancó y no va a arrancar solo.
   *
   * No lleva spinner a propósito. Antes este estado estaba dentro de `AWAITING`
   * y se mostraba como "esperando tu depósito" — que le decía al usuario
   * exactamente lo contrario de lo que tenía que hacer: no hay nada que
   * esperar, hay que completar el monto o esperar el reembolso.
   *
   * El monto recibido no se muestra porque no lo tenemos: 1Click lo devuelve en
   * `swapDetails.amountIn`, pero la fila no lo persiste y agregarle una columna
   * a `bridge_transfers` para esto sería mucho para un caso de borde. Lo que sí
   * sabemos —cuánto esperaba— alcanza para que el usuario sepa qué mandar.
   */
  const incompleteDepositStep = (row: BridgeTransfer) => (
    <>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#F0B429] bg-[#FFF7E6] text-[#B7791F]">
          <FiAlertCircle className="h-7 w-7" />
        </span>
        <p className="text-base font-semibold text-black">
          {t('wallet.bridge.incompleteTitle', 'The amount received is short')}
        </p>
        <p className="text-sm text-gray-600">
          {t(
            'wallet.bridge.incompleteBody',
            'The bridge expected {{amount}} USDC and received less, so the swap has not started.',
            { amount: row.amount },
          )}
        </p>
      </div>

      {/* Sólo la pata de entrada tiene arreglo del lado del usuario: es la
          única en la que él fondea la dirección a mano. En la de salida el pago
          lo mandó la app, así que pedirle que "complete la diferencia" sería
          mandarlo a pagar de nuevo una dirección con memo. */}
      {row.direction === 'evm_to_stellar' && row.depositAddress ? (
        <>
          <p className="text-sm text-gray-600">
            {t(
              'wallet.bridge.incompleteTopUp',
              'Send the difference to the same address before the quote expires. If it expires first, the bridge refunds what it received to your Base address.',
            )}
          </p>
          {addressRow(row.depositAddress)}
        </>
      ) : (
        <p className="text-sm text-gray-600">
          {t(
            'wallet.bridge.incompleteRefund',
            'The bridge will refund what it received once the quote expires. Contact support if it does not arrive.',
          )}
        </p>
      )}
    </>
  );

  const outcomeStep = (kind: 'success' | 'error', title: string, description: string) => (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full border ${
          kind === 'success' ? 'border-[#018222] bg-[#EAFBEA] text-[#018222]' : 'border-danger bg-[#FFECEC] text-danger'
        }`}
      >
        {kind === 'success' ? <FiCheckCircle className="h-7 w-7" /> : <FiXCircle className="h-7 w-7" />}
      </span>
      <p className="text-base font-semibold text-black">{title}</p>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );

  const footer = () => {
    if (!transfer) {
      return (
        <PressableButton
          variant="success"
          size="cta"
          onClick={handleContinue}
          disabled={!inputsReady || !quote || needsTrustline || createTransfer.isPending}
        >
          {createTransfer.isPending ? (
            <>
              <Spinner size="sm" color="current" />
              {t('wallet.bridge.creating', 'Preparing…')}
            </>
          ) : (
            <>
              {t('wallet.bridge.continue', 'Continue')}
              <FiArrowDown className="h-4 w-4" />
            </>
          )}
        </PressableButton>
      );
    }

    // Cotización vencida y sin pagar: la única salida segura es pedir otra.
    // Reusar la dirección vieja manda plata a un depósito que 1Click ya no
    // asocia a nada.
    if (quoteExpired) {
      return (
        <PressableButton variant="success" size="cta" onClick={handleStartOver}>
          {t('wallet.bridge.newQuote', 'Get a new quote')}
        </PressableButton>
      );
    }

    // Pata de salida sin pagar todavía: el botón que firma. Una vez que hay
    // hash, no se vuelve a ofrecer — pagar dos veces la misma dirección manda
    // el doble de plata al puente. `alreadySent` cubre también el pago que salió
    // pero todavía no confirmó, que es donde reintentar duele más.
    if (transfer.direction === 'stellar_to_evm' && !alreadySent && !isBridgeTerminal(transfer.status)) {
      return (
        <PressableButton
          variant="success"
          size="cta"
          onClick={() => handlePayFromStellar(transfer)}
          disabled={paying || attachDepositTx.isPending}
        >
          {paying || attachDepositTx.isPending ? (
            <>
              <Spinner size="sm" color="current" />
              {t('wallet.bridge.sending', 'Sending…')}
            </>
          ) : (
            t('wallet.bridge.send', 'Send {{amount}} USDC', { amount: transfer.amount })
          )}
        </PressableButton>
      );
    }

    return (
      <PressableButton variant="white" size="cta" onClick={onOpenChange}>
        {t('wallet.bridge.close', 'Close')}
      </PressableButton>
    );
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.bridge.title', 'Bridge USDC')}
      size="md"
      // Igual que el resto de los flujos de plata: no se cierra tocando afuera.
      isDismissable={false}
      hideClose={paying}
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={footer()}
    >
      {body()}
    </AppModal>
  );
}
