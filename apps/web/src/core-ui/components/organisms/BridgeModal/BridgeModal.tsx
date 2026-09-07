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

/** Estados de 1Click en los que el depósito todavía no se vio en la cadena. */
const AWAITING = ['PENDING_DEPOSIT', 'INCOMPLETE_DEPOSIT'];

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
    setPaying(true);
    setPayError(null);
    try {
      const { hash } = await sponsoredUsdcPayment({ to: row.depositAddress, amount: row.amount, memo });
      await attachDepositTx.mutateAsync({ id: row.id, txHash: hash });
      await refreshWalletBalance();
    } catch (e) {
      const { title } = humanizeTxError(e, t);
      setPayError(title);
    } finally {
      setPaying(false);
    }
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
          {quote.withdrawFee !== null && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">{t('wallet.bridge.fee', 'Network fee')}</dt>
              <dd className="text-black">{quote.withdrawFee}</dd>
            </div>
          )}
          {quote.timeEstimate !== null && (
            <div className="flex items-center justify-between">
              <dt className="text-gray-600">{t('wallet.bridge.eta', 'Estimated time')}</dt>
              <dd className="text-black">
                {t('wallet.bridge.etaSeconds', '~{{seconds}}s', { seconds: quote.timeEstimate })}
              </dd>
            </div>
          )}
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

      {payError && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {payError}
        </p>
      )}

      {row.sourceTxHash ? progressRow(row) : null}
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

  const progressRow = (row: BridgeTransfer) => (
    <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
      <Spinner size="sm" color="current" />
      {AWAITING.includes(row.status)
        ? t('wallet.bridge.waitingDeposit', 'Waiting for your deposit…')
        : t('wallet.bridge.processing', 'Bridging your USDC…')}
    </div>
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

    // Pata de salida sin pagar todavía: el botón que firma. Una vez que hay
    // hash, no se vuelve a ofrecer — pagar dos veces la misma dirección manda
    // el doble de plata al puente.
    if (transfer.direction === 'stellar_to_evm' && !transfer.sourceTxHash && !isBridgeTerminal(transfer.status)) {
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
