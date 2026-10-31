'use client';

import { supportEmail } from '@/core-ui/config/featureFlags';
import { renderQrPngFile, saveAffordanceFor, type SaveAffordance, saveQrImage } from '@/networks/pollar/qrImage';
import {
  describeRampAction,
  type PollarLanguage,
  type RampOrder,
  rampLegStatus,
  rampOrderReceive,
  rampOrderResolutionText,
  rampOrderStopped,
  type RampScannable,
} from '@pollar/core';
import { Spinner } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheck, FiCopy } from 'react-icons/fi';
import { formatTokenPrecise } from '../../../helpers/numbers';
import { useNowEverySecond } from '../../../hooks/useNowEverySecond';
import { ModalMessage } from '../../molecules/ModalMessage';
import { PressableButton } from '../../molecules/PressableButton';
import { SuccessCelebration } from '../../molecules/SuccessCelebration';

/** The `src` for a provider image that is not inline-safe. */
function scannableImageSrc(image: RampScannable['image']): string {
  return image.encoding === 'base64'
    ? `data:${image.mediaType};base64,${image.data}`
    : `data:${image.mediaType};charset=utf-8,${encodeURIComponent(image.data)}`;
}

/** "4:59" from a deadline; null once it passed. */
export function countdown(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return null;
  const left = Math.floor((Date.parse(expiresAt) - now) / 1000);
  if (left <= 0) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const money = (value: string | number) => formatTokenPrecise(Number(value), 2);

/**
 * The payment code. Drawn again from the payload when there is one: a provider's
 * SVG may use `currentColor` and iOS does not save it to Photos. The provider's
 * image stays as the fallback, for a provider that publishes only that.
 */
function PaymentQr({ payload, image, alt }: { payload: string | null; image: RampScannable['image'] | null; alt: string }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const affordance: SaveAffordance = useMemo(() => {
    if (typeof window === 'undefined') return 'none';
    const probe = new File([new Blob([''])], 'qr.png', { type: 'image/png' });
    return saveAffordanceFor({
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      canDownload: typeof URL.createObjectURL === 'function' && 'download' in document.createElement('a'),
      canShareFiles: navigator.canShare?.({ files: [probe] }) ?? false,
    });
  }, []);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    renderQrPngFile(payload, 'vaquita-qr.png')
      .then((rendered) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(rendered);
        setFile(rendered);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [payload]);

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      setSaved((await saveQrImage(file)) !== 'manual');
    } catch {
      // The share sheet was dismissed: nothing to report.
    } finally {
      setSaving(false);
    }
  };

  const frame = 'flex h-60 w-60 items-center justify-center rounded-lg border border-black border-b-2 bg-white p-2';
  let code: React.ReactNode;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    code = <img src={url} alt={alt} className={`${frame} object-contain`} />;
  } else if (payload && !failed) {
    code = (
      <div className={frame}>
        <Spinner size="sm" color="current" />
      </div>
    );
  } else if (image) {
    code = image.inlineSafe ? (
      <div
        className={`${frame} [&>svg]:h-full [&>svg]:w-full`}
        aria-label={alt}
        dangerouslySetInnerHTML={{ __html: image.data }}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={scannableImageSrc(image)} alt={alt} className={`${frame} object-contain`} />
    );
  } else if (payload) {
    code = (
      <p className="w-full break-all rounded-lg border border-black border-b-2 bg-white p-3 text-[11px] text-black">
        {payload}
      </p>
    );
  } else {
    code = null;
  }

  return (
    <div data-ph-block className="flex flex-col items-center gap-3">
      {code}
      {affordance === 'save' && file && (
        <PressableButton variant="white" size="md" onClick={() => void save()} disabled={saving}>
          {saved ? t('wallet.fiat.onramp.saved', 'Saved') : t('wallet.fiat.onramp.save', 'Save QR to my phone')}
        </PressableButton>
      )}
      {affordance === 'longPress' && url && (
        <p className="text-center text-[11px] text-gray-400">
          {t('wallet.fiat.onramp.longPress', 'Press and hold the code to save it to your photos.')}
        </p>
      )}
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the value stays visible to select.
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="break-all font-semibold text-black">{value}</span>
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('wallet.fiat.onramp.copy', 'Copy')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black border-b-2 bg-white text-black active:translate-y-0.5"
      >
        {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
      </button>
    </div>
  );
}

interface PollarBuyOrderScreenProps {
  order: RampOrder;
  language: PollarLanguage;
  /** What the user paid, for the summary; from the first leg when the order was resumed. */
  paid: { amount: string; currency: string };
  error: string | null;
  pollTrouble: boolean;
  checkingPayment: boolean;
  retrying: boolean;
  signing: boolean;
  onCheckPayment: () => void;
  onSign: () => void;
  onApprove: () => void;
  onRetry: () => void;
  onRequote: () => void;
  onSetUpRecovery: () => void;
  onNewPurchase: () => void;
  onDone: () => void;
}

/**
 * The purchase once it exists: pay the code or the transfer, then watch the
 * USDC arrive. One screen per state the order can be in, in the app's words,
 * with the SDK's helpers saying what each leg and failure is.
 */
export function PollarBuyOrderScreen(p: PollarBuyOrderScreenProps) {
  const { t } = useTranslation();
  const { order, language } = p;
  const view = describeRampAction(order, language);
  const settled = ['completed', 'failed', 'refunded'].includes(order.state);
  const stopped = rampOrderStopped(order);
  const receive = rampOrderReceive(order);
  const payment = order.pendingAction?.kind === 'FIAT_PAYMENT' ? order.pendingAction : null;
  const now = useNowEverySecond(!!payment && !!payment.expiresAt && !settled);
  const timeLeft = payment ? countdown(payment.expiresAt, now) : null;
  const paymentClosed = !!payment && !!payment.expiresAt && timeLeft === null;

  const help = (
    <p className="text-[11px] text-gray-400">
      {t('wallet.fiat.onramp.processingHelp', "If it hasn't arrived after 15 minutes, keep your bank receipt and write to us:")}{' '}
      <a href={`mailto:${supportEmail()}`} className="font-semibold text-primary">
        {supportEmail()}
      </a>
    </p>
  );

  // Done: the USDC is in the wallet.
  if (order.state === 'completed') {
    return (
      <SuccessCelebration
        title={t('wallet.fiat.onramp.settledTitle', 'Your USDC is in your wallet')}
        amount={
          receive
            ? { value: Number(receive.amount), format: (v) => `${receive.estimated ? '≈ ' : ''}${money(v)} ${receive.unit}` }
            : null
        }
        caption={
          <>
            {!receive && t('wallet.fiat.onramp.settledNoAmount', 'The USDC was credited to your wallet.')}
            {!receive && ' '}
            {t('wallet.fiat.onramp.settledPaid', 'You paid {{amount}} {{currency}}.', {
              amount: money(p.paid.amount),
              currency: p.paid.currency,
            })}
          </>
        }
      >
        <PressableButton variant="success" size="md" fullWidth onClick={p.onDone}>
          {t('wallet.fiat.onramp.close', 'Close')}
        </PressableButton>
      </SuccessCelebration>
    );
  }

  // Held or final with a failure: say what happened and what the user can do.
  if (order.failure && stopped) {
    const resolution = rampOrderResolutionText(order, language);
    const waitsOnRecovery = order.failure.resolutionAction === 'set_up_recovery';
    const asksNewQuote = order.failure.resolutionAction === 'accept_new_quote';
    const userResolves = order.failure.resolutionOwner === 'END_USER';
    return (
      <ModalMessage
        icon={FiAlertCircle}
        title={
          settled
            ? t('wallet.fiat.onramp.failedTitle', 'The purchase did not go through')
            : t('wallet.fiat.pollarBuy.heldTitle', 'Your purchase needs something from you')
        }
        body={
          resolution ??
          t(
            'wallet.fiat.onramp.failedBody',
            'The provider rejected it. If your bank already took the money, it will be returned. Keep the receipt.',
          )
        }
        className="py-4"
      >
        {!settled && waitsOnRecovery && (
          <PressableButton variant="primary" size="md" fullWidth onClick={p.onSetUpRecovery}>
            {t('wallet.fiat.pollarBuy.setUpRecovery', 'Protect my wallet')}
          </PressableButton>
        )}
        {!settled && asksNewQuote && (
          <PressableButton variant="primary" size="md" fullWidth onClick={p.onRequote}>
            {t('wallet.fiat.pollarBuy.newQuote', 'Get a new price')}
          </PressableButton>
        )}
        {!settled && userResolves && !asksNewQuote && !waitsOnRecovery && (
          <PressableButton variant="primary" size="md" fullWidth onClick={p.onRetry} disabled={p.retrying}>
            {p.retrying ? <Spinner size="sm" color="current" /> : t('wallet.fiat.pollarBuy.tryAgain', 'Try again')}
          </PressableButton>
        )}
        {settled && (
          <PressableButton variant="success" size="md" fullWidth onClick={p.onNewPurchase}>
            {t('wallet.fiat.onramp.restart', 'Start a new purchase')}
          </PressableButton>
        )}
        <p className="text-[11px] text-gray-400">
          {t('wallet.fiat.pollarBuy.orderRef', 'Order {{id}}', { id: order.id.slice(-8) })}
        </p>
        {p.error && <p className="text-xs font-medium text-red-600">{p.error}</p>}
      </ModalMessage>
    );
  }

  // Waiting for the fiat payment.
  if (payment) {
    const instructions = payment.instructions;
    if (paymentClosed) {
      return (
        <ModalMessage
          title={t('wallet.fiat.onramp.expiredTitle', 'This code expired')}
          body={t('wallet.fiat.onramp.expiredBody', 'Nothing was charged. Start again to get a new code with a fresh rate.')}
          className="py-4"
        >
          <PressableButton variant="success" size="md" fullWidth onClick={p.onNewPurchase}>
            {t('wallet.fiat.onramp.restart', 'Start a new purchase')}
          </PressableButton>
        </ModalMessage>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <p className="text-xs text-gray-500">{t('wallet.fiat.onramp.youPay', 'You pay')}</p>
          <p className="text-2xl font-bold text-black">
            {money(instructions.amount)} {instructions.currency}
          </p>
          {receive && (
            <p className="text-xs text-gray-500">
              {t('wallet.fiat.onramp.receiveEstimate', 'You receive ≈ {{amount}} USDC', { amount: money(receive.amount) })}
            </p>
          )}
        </div>

        {instructions.kind === 'qr' && (
          <>
            <p className="text-center text-xs text-gray-500">
              {t('wallet.fiat.onramp.payHint', 'Pay this QR from your bank app. The USDC arrives on its own.')}
            </p>
            <PaymentQr
              payload={view.scannable?.payload ?? instructions.payload}
              image={view.scannable?.image ?? null}
              alt={t('wallet.fiat.onramp.qrAlt', 'Payment QR code')}
            />
            {view.codeMissing && (
              <p className="text-center text-xs font-medium text-red-600">
                {t(
                  'wallet.fiat.pollarBuy.codeMissing',
                  'The payment code could not be shown. Close and open the purchase again.',
                )}
              </p>
            )}
          </>
        )}

        {instructions.kind === 'bank_transfer' && (
          <>
            <p className="text-center text-xs text-gray-500">
              {t(
                'wallet.fiat.pollarBuy.transferHint',
                'Make the transfer from your bank with these details. The USDC arrives on its own.',
              )}
            </p>
            <div className="flex flex-col gap-3 rounded-lg border border-black border-b-2 bg-white p-3">
              {view.details.map((d) => (
                <CopyValue key={d.label} label={d.label} value={d.value} />
              ))}
            </div>
          </>
        )}

        {instructions.kind === 'hosted' && (
          <p className="text-center text-xs text-gray-500">
            {t('wallet.fiat.pollarBuy.hostedHint', 'The payment is completed on the provider’s page.')}
          </p>
        )}

        {view.link && (
          <a
            href={view.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md border border-black border-b-3 bg-primary px-4 py-2.5 text-sm font-bold text-black"
          >
            {view.linkLabel ?? t('wallet.fiat.pollarBuy.openPayment', 'Open payment')}
          </a>
        )}

        <p className="flex items-center justify-center gap-2 text-xs font-semibold text-black" aria-live="polite">
          <Spinner size="sm" color="current" />
          {p.checkingPayment
            ? t('wallet.fiat.onramp.checkingPayment', 'Checking your payment…')
            : t('wallet.fiat.onramp.waitingPayment', 'Waiting for your payment…')}
        </p>
        {timeLeft && (
          <p className="text-center text-xs font-semibold text-gray-500">
            {t('wallet.fiat.onramp.expiresIn', 'Expires in {{time}}', { time: timeLeft })}
          </p>
        )}

        <PressableButton variant="success" size="md" fullWidth onClick={p.onCheckPayment} disabled={p.checkingPayment}>
          {t('wallet.fiat.pollarBuy.paid', 'I already paid')}
        </PressableButton>
        {p.pollTrouble && (
          <p className="text-center text-[11px] text-gray-400">
            {t('wallet.fiat.pollarBuy.serverTrouble', 'Having trouble reaching the server. Retrying…')}
          </p>
        )}
        {p.error && <p className="text-center text-xs font-medium text-red-600">{p.error}</p>}
      </div>
    );
  }

  // Something to sign or approve, or the provider checking the user.
  if (view.canSign || view.canApprove || order.pendingAction?.kind === 'KYC') {
    return (
      <ModalMessage title={view.title} body={view.note} className="py-4">
        {view.canSign && (
          <PressableButton variant="primary" size="md" fullWidth onClick={p.onSign} disabled={p.signing}>
            {p.signing ? <Spinner size="sm" color="current" /> : t('wallet.fiat.pollarBuy.authorize', 'Authorize')}
          </PressableButton>
        )}
        {view.canApprove && (
          <PressableButton variant="primary" size="md" fullWidth onClick={p.onApprove}>
            {t('wallet.fiat.pollarBuy.approveOnDevice', 'Approve on this device')}
          </PressableButton>
        )}
        {view.link && (
          <a
            href={view.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md border border-black border-b-3 bg-primary px-4 py-2.5 text-sm font-bold text-black"
          >
            {view.linkLabel ?? t('wallet.fiat.onramp.kycOpen', 'Open verification')}
          </a>
        )}
        {order.pendingAction?.kind === 'KYC' && !view.link && (
          <p className="text-xs text-gray-500">
            {t(
              'wallet.fiat.onramp.kycNoLinkBody',
              'They are reviewing it. This can take a while: leave this screen open and we continue as soon as you are approved.',
            )}
          </p>
        )}
        {p.error && <p className="text-xs font-medium text-red-600">{p.error}</p>}
      </ModalMessage>
    );
  }

  // Each step in the user's words, with no chain or provider names.
  const legLabel = (kind: RampOrder['legs'][number]['kind']): string => {
    switch (kind) {
      case 'PROVIDER_ONRAMP':
        return t('wallet.fiat.pollarBuy.leg.onramp', 'Your payment arrived');
      case 'SWAP':
        return t('wallet.fiat.pollarBuy.leg.swap', 'Converting to USDC');
      case 'BRIDGE':
        return t('wallet.fiat.pollarBuy.leg.bridge', 'Moving it to your wallet');
      case 'PROVIDER_OFFRAMP':
        return t('wallet.fiat.pollarBuy.leg.offramp', 'Paying your bank');
    }
  };

  // Paid and moving on its own.
  return (
    <ModalMessage
      figure={<Spinner size="lg" color="current" />}
      title={t('wallet.fiat.onramp.processingTitle', 'Payment received')}
      body={t(
        'wallet.fiat.onramp.processingBody',
        'Your USDC usually arrives in a few minutes, and can take up to 15. You can close this. It lands in your wallet on its own.',
      )}
    >
      {order.legs.length > 1 && (
        <ul className="w-full text-left text-xs">
          {order.legs.map((leg) => {
            const status = rampLegStatus(leg);
            return (
              <li key={leg.index} className="flex items-center gap-2 py-1 text-gray-600">
                <span
                  className={
                    'h-2 w-2 shrink-0 rounded-full ' +
                    (status === 'done'
                      ? 'bg-success'
                      : status === 'active'
                        ? 'bg-primary'
                        : status === 'failed'
                          ? 'bg-error'
                          : 'bg-black/15')
                  }
                />
                <span className={status === 'done' ? 'text-gray-400' : ''}>{legLabel(leg.kind)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {help}
      {p.pollTrouble && (
        <p className="text-[11px] text-gray-400">
          {t('wallet.fiat.pollarBuy.serverTrouble', 'Having trouble reaching the server. Retrying…')}
        </p>
      )}
      <PressableButton variant="success" size="md" fullWidth onClick={p.onDone}>
        {t('wallet.fiat.onramp.close', 'Close')}
      </PressableButton>
    </ModalMessage>
  );
}
