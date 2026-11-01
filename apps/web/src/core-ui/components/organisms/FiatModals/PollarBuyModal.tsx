'use client';

import {
  appUnavailableMessage,
  assertRampStellarSigner,
  type CosignCustody,
  isPollarApiError,
  isPollarNetworkError,
  type PollarLanguage,
  type RampOrder,
  type RampQuote,
  type RampQuoteRejection,
  type RampQuoteRequirement,
  type RampRoute,
  type RampWalletStep,
  rampNoRouteText,
  rampQuoteFields,
  rampRailLabel,
  rampResolutionText,
  rampTrustlineAsset,
  rampTrustlineErrorText,
  rampWalletStep,
} from '@pollar/core';
import { ProviderRegistrationModal, RegistryCheckModal, RequirementFormModal, usePollar } from '@pollar/react';
import { Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiCheckCircle, FiClock, FiFileText, FiKey, FiShield, FiSmartphone, FiUser } from 'react-icons/fi';
import { FIAT_DECIMALS, formatTokenFine, formatTokenPrecise, MONEY_INPUT_DECIMALS } from '../../../helpers/numbers';
import { useAnalytics } from '../../../hooks';
import { useNowEverySecond } from '../../../hooks/useNowEverySecond';
import {
  cosignClosed,
  openCosign,
  openWalletRecovery,
  usePendingCreditStore,
  useRampActiveStore,
  useWalletRecoveryStore,
} from '../../../stores';
import { AmountStep, useAmountShake } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { KycSheet } from '../Kyc/KycSheet';
import { ModalMessage } from '../../molecules/ModalMessage';
import { PressableButton } from '../../molecules/PressableButton';
import { countdown, PollarBuyOrderScreen } from './PollarBuyOrderScreen';
import { RampQuoteFields } from './RampQuoteFields';

interface PollarBuyModalProps {
  open: boolean;
  /** ISO 3166-1 alpha-2 country picked in the app's selector. */
  country: string;
  onOpenChange: () => void;
  onBack?: () => void;
}

type Phase = 'amount' | 'quoting' | 'review' | 'details' | 'order';

/** One thing to do before the amount can be quoted, shown on its own with what runs it. */
interface BuyStep {
  icon: IconType;
  title: string;
  body: string;
  actions: Array<{ label: string; run: () => void; busy?: boolean; variant?: 'primary' | 'white' }>;
}

/** Resolves once the wallet recovery sheet closes. */
const recoveryClosed = () =>
  new Promise<void>((resolve) => {
    const unsubscribe = useWalletRecoveryStore.subscribe((state) => {
      if (state.open) return;
      unsubscribe();
      resolve();
    });
  });

const POLLAR_LANGUAGES: PollarLanguage[] = ['en', 'es', 'pt'];
/** An exact decimal, as the API takes amounts. */
const DECIMAL = /^\d+(\.\d+)?$/;
/** After "I already paid", the payment is checked this often for this long. */
const PAYMENT_CHECK_EVERY_MS = 10_000;
const PAYMENT_CHECK_WINDOW_MS = 2 * 60_000;
const SETTLED_STATES = ['completed', 'failed', 'refunded'];
/** A fee at or above this share of the amount is called out in amber. */
const FEE_HEAVY_SHARE = 0.15;

const money = (value: string | number) => formatTokenPrecise(Number(value), 2);
const etaText = (seconds: number | null): string | null => {
  if (seconds === null) return null;
  if (seconds < 90) return `~1 min`;
  if (seconds < 5400) return `~${Math.round(seconds / 60)} min`;
  return `~${Math.round(seconds / 3600)} h`;
};

/** The server refuses a lapsed quote; the same route is taken on a fresh one instead. */
const quoteLapsed = (q: RampQuote) => Date.parse(q.expiresAt) <= Date.now();

/** A route's identity across quotes: quoting again gives the same route a new quote id. */
function routeKey(quote: RampQuote): string {
  const node = (n: RampQuote['legs'][number]['from']) =>
    n.kind === 'asset' ? `${n.code}:${n.chain}` : `${n.currency}:${n.rail}`;
  return quote.legs.map((leg) => `${leg.kind}:${node(leg.from)}>${node(leg.to)}`).join('|');
}

/**
 * Buying USDC with local currency through Pollar's ramps, in Vaquita's own
 * screens. The country comes from the app's picker and Vaquita only holds USDC
 * on Stellar, so the first screen is the amount, nothing else to pick.
 *
 * Amount, then the price (the best route the provider quotes; the others pay
 * the same way for the same thing, so they are not offered), then whatever details the provider asks for, then the payment.
 * The SDK's helpers phrase what a route or an order needs; the layout and the
 * main copy are the app's. A purchase left open is picked up on the next
 * opening, and closing with one in flight starts the pending-credit watch so
 * what lands is offered for savings.
 */
export function PollarBuyModal({ open, country, onOpenChange, onBack }: PollarBuyModalProps) {
  const { t, i18n } = useTranslation();
  const language = POLLAR_LANGUAGES.find((l) => i18n.language.startsWith(l)) ?? 'en';
  const { getClient, refreshWalletBalance, appConfig, recoveryLocked, refreshRecovery } = usePollar();
  const { trackUserAction } = useAnalytics();
  const setRampActive = useRampActiveStore((s) => s.setRampActive);
  const startPendingCredit = usePendingCreditStore((s) => s.startPendingCredit);
  const { controls, shake } = useAmountShake();

  const [phase, setPhase] = useState<Phase>('amount');
  const [routes, setRoutes] = useState<RampRoute[] | null>(null);
  const [amount, setAmount] = useState('');
  const [quotes, setQuotes] = useState<RampQuote[]>([]);
  const [rejected, setRejected] = useState<RampQuoteRejection[]>([]);
  const [selected, setSelected] = useState<RampQuote | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<RampOrder | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<RampQuoteRequirement | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [pollTrouble, setPollTrouble] = useState(false);
  const [paymentCheckUntil, setPaymentCheckUntil] = useState<number | null>(null);
  const promptedApproval = useRef<string | null>(null);
  const custodyChoice = appConfig.application?.walletCustodyMode === 'USER_CHOICE';

  // Vaquita holds USDC on Stellar: the country's routes that end there.
  const countryRoutes = (routes ?? []).filter(
    (r) => r.fiat.country === country && r.asset.chain === 'STELLAR' && r.asset.code.toUpperCase() === 'USDC',
  );
  const route = countryRoutes[0] ?? null;
  const fields = selected ? rampQuoteFields(selected) : [];

  const errorText = (err: unknown, fallback: string): string => {
    const unavailable = appUnavailableMessage(err, language);
    if (unavailable) return unavailable;
    if (isPollarApiError(err)) {
      const message = err.body.message;
      if (typeof message === 'string' && message && !/^[A-Z0-9_]+$/.test(message)) return message;
    }
    return fallback;
  };

  // The provider's price has a life (`expiresAt`): it counts down under the
  // breakdown and, when it runs out before the user confirms, the amount is
  // quoted again by itself. Confirming a lapsed one would be refused anyway.
  const reviewing = phase === 'review' && quotes.length > 0 && busy === null;
  const now = useNowEverySecond(reviewing);
  const expiresAt = reviewing ? quotes[0]!.expiresAt : null;
  const priceLeft = expiresAt ? countdown(expiresAt, now) : null;

  // Reset when it closes, so the next opening starts clean.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setPhase('amount');
      setAmount('');
      setQuotes([]);
      setRejected([]);
      setSelected(null);
      setOrder(null);
      setBusy(null);
      setError(null);
      setAmountError(null);
      setVerifying(null);
      setPaymentCheckUntil(null);
    }
  }

  // A wallet with no way to recover signs nothing: read that again on every
  // opening, so the keypad is not offered before the step that unlocks it.
  useEffect(() => {
    if (open) refreshRecovery();
  }, [open, refreshRecovery]);

  // Routes for the country and a purchase left open, read on every opening.
  useEffect(() => {
    if (!open) return;
    const client = getClient();
    let cancelled = false;
    setRampActive(true);
    client
      .getRampRoutes('ONRAMP')
      .then(({ routes: found }) => {
        if (!cancelled) setRoutes(found);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRoutes([]);
          setError(
            errorText(err, t('wallet.fiat.pollarBuy.loadFailed', 'Could not load the payment options. Try again later.')),
          );
        }
      });
    client
      .listRampOrders({ open: 'true', limit: 5 })
      .then(({ orders }) => {
        const pending = orders.find((o) => o.direction === 'ONRAMP');
        if (!cancelled && pending) {
          setOrder(pending);
          setPhase('order');
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // errorText only reads stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, getClient, setRampActive, t]);

  // Closing hands the wallet back to the idle-funds prompt. A purchase still in
  // flight starts the pending-credit window so what lands is offered for savings.
  const orderOpen = !!order && !SETTLED_STATES.includes(order.state);
  const orderOpenRef = useRef(orderOpen);
  useEffect(() => {
    orderOpenRef.current = orderOpen;
  });
  useEffect(() => {
    if (open) return;
    promptedApproval.current = null;
    setRampActive(false);
    void refreshWalletBalance();
    if (orderOpenRef.current) startPendingCredit();
  }, [open, setRampActive, refreshWalletBalance, startPendingCredit]);
  useEffect(() => () => setRampActive(false), [setRampActive]);

  // Follow the order at the pace the server suggests until it settles.
  const orderId = order?.id ?? null;
  useEffect(() => {
    if (phase !== 'order' || !orderId) return;
    const controller = new AbortController();
    getClient()
      .pollRampOrder(orderId, {
        signal: controller.signal,
        onUpdate: (next) => {
          setOrder(next);
          setPollTrouble(false);
          // Past the payment, the checks the user asked for are over.
          if (next.pendingAction?.kind !== 'FIAT_PAYMENT') setPaymentCheckUntil(null);
        },
        onError: () => setPollTrouble(true),
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            errorText(err, t('wallet.fiat.pollarBuy.readFailed', 'Could not read the purchase. Close and open it again.')),
          );
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getClient, phase, orderId, pollKey]);

  // The user said they paid: ask the provider often for a while.
  useEffect(() => {
    if (paymentCheckUntil === null || !orderId) return;
    const timer = setInterval(() => {
      if (Date.now() >= paymentCheckUntil) {
        setPaymentCheckUntil(null);
        return;
      }
      getClient()
        .checkRampOrder(orderId)
        .then(setOrder)
        .catch(() => undefined);
    }, PAYMENT_CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [getClient, orderId, paymentCheckUntil]);

  // A co-signed step waits on this device: bring the approval up when it appears.
  const approval = order?.pendingAction?.kind === 'COSIGN_APPROVAL' ? order.pendingAction.actionId : null;
  useEffect(() => {
    if (!approval || promptedApproval.current === approval) return;
    promptedApproval.current = approval;
    void getClient()
      .cosign.pending()
      .catch(() => undefined)
      .then(() => openCosign());
  }, [approval, getClient]);

  /**
   * Brings up the approval sheet for a request the SDK just created and waits
   * for it. True when nothing is left pending afterwards, so the caller can go
   * on by itself instead of asking the user to try again.
   */
  const approveOnDevice = async (): Promise<boolean> => {
    const client = getClient();
    await client.cosign.pending().catch(() => undefined);
    openCosign();
    await cosignClosed();
    const left = await client.cosign.pending().catch(() => null);
    return left !== null && left.length === 0;
  };

  /** Quotes the amount; the quotes found, none when it failed. */
  const quote = async (): Promise<RampQuote[]> => {
    if (!route) return [];
    const value = amount.trim();
    if (!DECIMAL.test(value) || Number(value) <= 0) {
      setAmountError(t('wallet.fiat.pollarBuy.amountInvalid', 'Enter an amount greater than zero.'));
      shake();
      return [];
    }
    setPhase('quoting');
    setError(null);
    setSelected(null);
    try {
      const result = await getClient().quoteRamp({
        direction: 'ONRAMP',
        fiat: { currency: route.fiat.currency, rail: route.fiat.rail, country: route.fiat.country },
        asset: { code: route.asset.code, identifier: route.asset.identifier, chain: route.asset.chain },
        amount: { value, denomination: 'in' },
      });
      setQuotes(result.quotes);
      setRejected(result.rejected);
      if (result.quotes.length === 0 && result.rejected.every((r) => r.failure.resolutionAction === 'change_amount')) {
        // Out of the route's limits: back to the keypad with the limit as the hint.
        setAmountError(rampNoRouteText(result.rejected, language));
        setPhase('amount');
        shake();
        return [];
      }
      setPhase('review');
      return result.quotes;
    } catch (err) {
      if (isPollarApiError(err) && err.code === 'SDK_RAMPS_NO_ROUTE') {
        const dropped = Array.isArray(err.body.rejected) ? (err.body.rejected as RampQuoteRejection[]) : [];
        setQuotes([]);
        setRejected(dropped);
        setPhase('review');
        return [];
      }
      setError(errorText(err, t('wallet.fiat.pollarBuy.quoteFailed', 'Could not get a price. Please try again.')));
      setPhase('amount');
      return [];
    }
  };

  // Quotes again by itself once the price in hand runs out (see `priceLeft`).
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => void quote(), Math.max(0, Date.parse(expiresAt) - now));
    return () => clearTimeout(timer);
    // quote reads the amount and route of this render; the timer is re-armed on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, now]);

  /** Quotes again and goes on with the same route on its fresh quote. */
  const resumeRoute = async (key: string) => {
    const same = (await quote()).find((q) => routeKey(q) === key);
    if (same) void select(same, true);
    else setError(t('wallet.fiat.pollarBuy.routeGone', 'That option is no longer available. Pick another one.'));
  };

  const select = async (q: RampQuote, fresh = false) => {
    if (!fresh && quoteLapsed(q)) {
      void resumeRoute(routeKey(q));
      return;
    }
    setSelected(q);
    setError(null);
    const missing = rampQuoteFields(q).some((f) => !f.optional && !(fieldValues[f.key] ?? '').trim());
    if (missing) setPhase('details');
    else await startOrder(q, fresh);
  };

  const startOrder = async (q: RampQuote, fresh = false, retried = false) => {
    setBusy('order');
    setError(null);
    try {
      const payee = Object.fromEntries(
        rampQuoteFields(q)
          .map((f) => [f.key, (fieldValues[f.key] ?? '').trim()])
          .filter(([, value]) => value),
      );
      const created = await getClient().createRampOrder({
        quoteId: q.quoteId,
        ...(Object.keys(payee).length ? { payee } : {}),
      });
      trackUserAction('deposit_onramp_order_created', { country, amount: q.amountIn, currency: route?.fiat.currency ?? null });
      setOrder(created);
      setPhase('order');
    } catch (err) {
      if (isPollarApiError(err) && err.code === 'SDK_RAMPS_WALLET_NOT_READY') {
        // The wallet needs an account on the route's chain: its approval opens
        // here and, once approved, the order is placed again without another tap.
        if (!retried && (await approveOnDevice())) return startOrder(q, fresh, true);
        setError(t('wallet.fiat.pollarBuy.approveAccount', 'Approve the new account on your device, then try again.'));
        setPhase('review');
        return;
      }
      if (isPollarApiError(err) && err.code === 'SDK_RAMPS_QUOTE_EXPIRED' && !fresh) {
        void resumeRoute(routeKey(q));
        return;
      }
      setError(errorText(err, t('wallet.fiat.pollarBuy.startFailed', 'Could not start the purchase. Please try again.')));
      setPhase(isPollarApiError(err) && err.code === 'VALIDATION_ERROR' && rampQuoteFields(q).length ? 'details' : 'review');
    } finally {
      setBusy(null);
    }
  };

  /** Adds the trustline a dropped route needs, then quotes again. */
  const trustAsset = async (asset: { code: string; issuer: string }) => {
    setBusy('trust');
    setError(null);
    try {
      const client = getClient();
      const outcome = await client.setTrustline(asset);
      if (outcome.status === 'error') {
        setError(rampTrustlineErrorText(outcome, asset.code, language));
        return;
      }
      if (outcome.status === 'cosign_pending' && !(await approveOnDevice())) {
        setError(
          t('wallet.fiat.pollarBuy.approveTrustline', 'Approve adding {{code}} on your device, then try again.', {
            code: asset.code,
          }),
        );
        return;
      }
      await client.refreshAssets().catch(() => undefined);
      await quote();
    } catch (err) {
      setError(
        errorText(
          err,
          t('wallet.fiat.pollarBuy.trustFailed', 'Could not enable {{code}}. Please try again.', { code: asset.code }),
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  /** Runs the wallet step a dropped route asks for, then quotes again. */
  const walletStep = async (step: RampWalletStep, custody?: CosignCustody) => {
    setBusy('wallet');
    setError(null);
    try {
      const { recoveryRequired } = await getClient().runRampWalletStep(step, custody);
      if (recoveryRequired) {
        // The recovery sheet covers this one; once it closes the amount is quoted
        // again, so the next step (if any) takes this one's place.
        openWalletRecovery();
        await recoveryClosed();
      }
      await quote();
    } catch (err) {
      if (isPollarApiError(err) && err.code === 'SDK_RAMPS_WALLET_NOT_READY') {
        if (await approveOnDevice()) {
          await quote();
          return;
        }
        setError(t('wallet.fiat.pollarBuy.approveAccount', 'Approve the new account on your device, then try again.'));
        return;
      }
      setError(errorText(err, t('wallet.fiat.pollarBuy.walletFailed', 'Could not prepare the wallet. Please try again.')));
    } finally {
      setBusy(null);
    }
  };

  const checkPayment = async () => {
    if (!order || paymentCheckUntil !== null) return;
    setError(null);
    setPaymentCheckUntil(Date.now() + PAYMENT_CHECK_WINDOW_MS);
    try {
      setOrder(await getClient().checkRampOrder(order.id));
    } catch (err) {
      if (isPollarNetworkError(err)) return;
      setPaymentCheckUntil(null);
      setError(errorText(err, t('wallet.fiat.pollarBuy.checkFailed', 'Could not check the payment. Please try again.')));
    }
  };

  /** Signs a leg with the connected Stellar wallet (an external one; a custodial wallet signs on the server). */
  const sign = async () => {
    const action = order?.pendingAction;
    if (!order || action?.kind !== 'SIGNATURE' || busy) return;
    setBusy('sign');
    setError(null);
    const client = getClient();
    let release: (() => void) | null = null;
    try {
      try {
        release = client.registerRampSigningHandler('STELLAR', 'xdr', async (signature) => {
          const wallet = client.getWallet();
          if (!wallet)
            throw new Error(t('wallet.fiat.pollarBuy.connectWallet', 'Connect the wallet this purchase was built for.'));
          assertRampStellarSigner(signature, wallet.address);
          const outcome = await client.signTx(signature.payload.value);
          if (outcome.status === 'signed') return outcome.signedXdr;
          throw new Error(
            outcome.status === 'error'
              ? (outcome.message ?? outcome.details ?? t('wallet.fiat.pollarBuy.signingCancelled', 'Signing was cancelled.'))
              : t('wallet.fiat.pollarBuy.signingCancelled', 'Signing was cancelled.'),
          );
        });
      } catch {
        // The app registered its own signer for Stellar: that one signs.
      }
      setOrder(await client.signRampLeg(order.id, action.actionId));
    } catch (err) {
      setError(
        errorText(
          err,
          err instanceof Error && err.message
            ? err.message
            : t('wallet.fiat.pollarBuy.signingCancelled', 'Signing was cancelled.'),
        ),
      );
      setOrder(await client.getRampOrder(order.id).catch(() => order));
    } finally {
      release?.();
      setBusy(null);
    }
  };

  const retryOrder = async () => {
    if (!order || busy) return;
    setBusy('retry');
    setError(null);
    try {
      setOrder(await getClient().retryRampOrder(order.id));
      setPollKey((k) => k + 1);
    } catch (err) {
      setError(errorText(err, t('wallet.fiat.pollarBuy.retryFailed', 'Could not try again. Please try again in a moment.')));
    } finally {
      setBusy(null);
    }
  };

  const newPurchase = () => {
    setOrder(null);
    setSelected(null);
    setQuotes([]);
    setRejected([]);
    setError(null);
    setPaymentCheckUntil(null);
    setPhase('amount');
  };

  const requote = () => {
    setOrder(null);
    void quote();
  };

  // A verification step replaces the sheet while it runs; a completed one quotes again.
  if (verifying) {
    const progress = { progress: { position: verifying.completed + 1, total: verifying.total } };
    const close = () => setVerifying(null);
    const done = () => {
      setVerifying(null);
      void quote();
    };
    if (verifying.type === 'FORM')
      return (
        <RequirementFormModal
          formId={verifying.optionId}
          {...progress}
          language={language}
          onClose={close}
          onSubmitted={done}
        />
      );
    if (verifying.type === 'REGISTRY_CHECK')
      return (
        <RegistryCheckModal optionId={verifying.optionId} {...progress} language={language} onClose={close} onApproved={done} />
      );
    if (verifying.type === 'PROVIDER_REGISTRATION')
      return (
        <ProviderRegistrationModal
          corridorId={verifying.corridorId}
          {...progress}
          language={language}
          onClose={close}
          onRegistered={done}
        />
      );
    return (
      <KycSheet
        country={country}
        corridorId={verifying.corridorId}
        providerId={verifying.optionId}
        onClose={close}
        onApproved={done}
      />
    );
  }

  const currency = route?.fiat.currency ?? '';
  const best = quotes[0] ?? null;
  const canGoBack = phase === 'review' || phase === 'details';

  /** The rails the user pays through, named as people know them. */
  const railsOf = (q: RampQuote) =>
    q.legs
      .map((leg) => (leg.from.kind === 'fiat' ? rampRailLabel(leg.from.rail, { language }) : null))
      .filter(Boolean)
      .join(' · ');

  /**
   * The breakdown right before paying, as the older purchase sheet showed it:
   * what goes in, the fee it already includes, what comes out, the rate and how
   * long it takes. The fee is the provider's charges in the paid currency; a
   * share at or above FEE_HEAVY_SHARE is called out, since it weighs on small
   * amounts and the user may rather raise the amount.
   */
  const quoteRows = (q: RampQuote): Array<{ label: string; value: string; heavy?: boolean }> => {
    const amountIn = Number(q.amountIn);
    const amountOut = Number(q.amountOut);
    const fee = q.legs
      .flatMap((leg) => leg.providerFees)
      .filter((f) => f.currency.toUpperCase() === currency.toUpperCase())
      .reduce((sum, f) => sum + Number(f.amount), 0);
    const feeShare = fee > 0 && amountIn > 0 ? fee / amountIn : null;
    const feePercent =
      feeShare == null
        ? ''
        : (feeShare * 100 >= 10 ? Math.round(feeShare * 100) : Math.round(feeShare * 1000) / 10).toLocaleString();
    const eta = etaText(q.etaSeconds);
    const rows: Array<{ label: string; value: string; heavy?: boolean }> = [
      { label: t('wallet.fiat.onramp.youPay', 'You pay'), value: `${money(amountIn)} ${currency}` },
    ];
    if (feeShare != null)
      rows.push({
        label: t('wallet.fiat.onramp.feeLabel', 'Includes fee'),
        value: t('wallet.fiat.onramp.feeValue', '{{amount}} · {{percent}}%', {
          amount: `${formatTokenPrecise(fee, FIAT_DECIMALS)} ${currency}`,
          percent: feePercent,
        }),
        heavy: feeShare >= FEE_HEAVY_SHARE,
      });
    rows.push({
      label: t('wallet.fiat.onramp.youReceive', 'You receive'),
      value: t('wallet.fiat.onramp.outUsdc', '≈ {{amount}} USDC', { amount: formatTokenFine(amountOut) }),
    });
    if (amountOut > 0)
      rows.push({
        label: t('wallet.fiat.onramp.rateLabel', 'Rate'),
        value: `${formatTokenPrecise(amountIn / amountOut, FIAT_DECIMALS)} ${currency} / USDC`,
      });
    if (eta) rows.push({ label: t('wallet.fiat.onramp.etaLabel', 'Estimated time'), value: eta });
    return rows;
  };

  /** What a provider's verification step asks, and the button that opens it. */
  const requirementStep = (requirement: RampQuoteRequirement): BuyStep => {
    const open = (label: string) => [{ label, run: () => setVerifying(requirement) }];
    const wait = [{ label: t('wallet.fiat.pollarBuy.gotIt', 'Got it'), run: onOpenChange, variant: 'white' as const }];
    if (requirement.type === 'FORM')
      return {
        icon: FiFileText,
        title: t('wallet.fiat.pollarBuy.detailsTitle', 'A few details'),
        body: t('wallet.fiat.pollarBuy.formBody', 'The payment provider needs a few details about you before you continue.'),
        actions: open(t('wallet.fiat.pollarBuy.continue', 'Continue')),
      };
    if (requirement.type === 'PROVIDER_REGISTRATION')
      return {
        icon: FiUser,
        title: t('wallet.fiat.pollarBuy.registrationTitle', 'Sign up with the provider'),
        body: t(
          'wallet.fiat.pollarBuy.registrationBody',
          'To deposit this way you need an account with the payment provider. It only takes a moment.',
        ),
        actions: open(t('wallet.fiat.pollarBuy.continue', 'Continue')),
      };
    if (requirement.type === 'REGISTRY_CHECK')
      return requirement.status === 'pending'
        ? {
            icon: FiClock,
            title: t('wallet.fiat.pollarBuy.registryPendingTitle', 'We are confirming your details'),
            body: t('wallet.fiat.pollarBuy.registryPendingBody', 'This can take a moment. Try again in a little while.'),
            actions: wait,
          }
        : {
            icon: FiCheckCircle,
            title: t('wallet.fiat.pollarBuy.registryTitle', 'Confirm your details'),
            body: t(
              'wallet.fiat.pollarBuy.registryBody',
              'The payment provider needs to confirm your details before you continue.',
            ),
            actions: open(t('wallet.fiat.pollarBuy.registryConfirm', 'Confirm')),
          };
    switch (requirement.status) {
      case 'expired':
        return {
          icon: FiShield,
          title: t('wallet.fiat.pollarBuy.verifyExpiredTitle', 'Your verification expired'),
          body: t('wallet.fiat.pollarBuy.verifyExpiredBody', 'You need to verify your identity again to keep going.'),
          actions: open(t('wallet.fiat.pollarBuy.verifyAgain', 'Verify again')),
        };
      case 'pending':
        if (!requirement.reviewReason)
          return {
            icon: FiShield,
            title: t('wallet.fiat.pollarBuy.verifyContinueTitle', 'Finish your verification'),
            body: t(
              'wallet.fiat.pollarBuy.verifyContinueBody',
              'You started verifying your identity and a few steps are left.',
            ),
            actions: open(t('wallet.fiat.pollarBuy.continue', 'Continue')),
          };
        return requirement.reviewReason === 'DUPLICATE_DOCUMENT'
          ? {
              icon: FiShield,
              title: t('wallet.fiat.pollarBuy.verifyDuplicateTitle', 'That document is already in use'),
              body: t(
                'wallet.fiat.pollarBuy.verifyDuplicateBody',
                'It is linked to another account with the provider. Write to us and we will sort it out.',
              ),
              actions: wait,
            }
          : {
              icon: FiClock,
              title: t('wallet.fiat.pollarBuy.verifyReviewTitle', 'Your verification is under review'),
              body: t(
                'wallet.fiat.pollarBuy.verifyReviewBody',
                'The provider is checking your details. It usually takes little time and we will let you know when it is ready.',
              ),
              actions: wait,
            };
      case 'rejected':
        return {
          icon: FiShield,
          title: t('wallet.fiat.pollarBuy.verifyRejectedTitle', 'We could not verify you'),
          body: t(
            'wallet.fiat.pollarBuy.verifyRejectedBody',
            'The provider could not approve your verification. Write to us and we will look into it with you.',
          ),
          actions: wait,
        };
      default:
        return {
          icon: FiShield,
          title: t('wallet.fiat.pollarBuy.verifyTitle', 'We need to verify you'),
          body: t(
            'wallet.fiat.pollarBuy.verifyBody',
            'To deposit from your bank, the payment provider needs to verify your identity. It takes a few minutes and you only do it once.',
          ),
          actions: open(t('wallet.fiat.pollarBuy.verifyAction', 'Verify my identity')),
        };
    }
  };

  const recoveryStep = (run: () => void, running: boolean): BuyStep => ({
    icon: FiKey,
    title: t('wallet.fiat.pollarBuy.recoveryTitle', 'Protect your wallet'),
    body: t(
      'wallet.fiat.pollarBuy.recoveryBody',
      'Before it signs a deposit, your wallet needs a way to recover it if you lose this device. It is quick and you do it once.',
    ),
    actions: [{ label: t('wallet.fiat.pollarBuy.setUpRecovery', 'Protect my wallet'), run, busy: running }],
  });

  /** Opens the recovery sheet and reads the state again once it closes. */
  const protectWallet = async () => {
    setBusy('wallet');
    try {
      openWalletRecovery();
      await recoveryClosed();
      refreshRecovery();
    } finally {
      setBusy(null);
    }
  };

  /**
   * The one thing to do before this amount can be quoted, out of everything the
   * dropped routes ask for, one step at a time: the wallet first (the same for
   * every route), then the asset, then the provider's verification. A completed
   * step quotes again, and the next one, if any, takes its place.
   */
  const step = ((): BuyStep | null => {
    if (phase === 'amount' && route && recoveryLocked) return recoveryStep(() => void protectWallet(), busy === 'wallet');
    if (phase !== 'review' || quotes.length > 0 || rejected.length === 0) return null;
    const wallet = rejected.map((r) => rampWalletStep(r, language)).find((s) => s !== null) ?? null;
    if (wallet) {
      const run = (custody?: CosignCustody) => () => void walletStep(wallet, custody);
      const running = busy === 'wallet';
      if (wallet.action === 'set_up_recovery') return recoveryStep(run(), running);
      if (wallet.action === 'migrate_custody')
        return {
          icon: FiSmartphone,
          title: t('wallet.fiat.pollarBuy.moveTitle', 'Move your wallet to this device'),
          body: t(
            'wallet.fiat.pollarBuy.moveBody',
            'To deposit, your keys move to this device and every signature comes from here. The wallet moves with everything in it.',
          ),
          actions: custodyChoice
            ? [
                { label: t('custodyMigration.cosignedTitle', 'Shared signing'), run: run('COSIGNED'), busy: running },
                {
                  label: t('custodyMigration.selfCustodyTitle', 'Only on this device'),
                  run: run('SELF_CUSTODY'),
                  busy: running,
                  variant: 'white',
                },
              ]
            : [{ label: t('wallet.fiat.pollarBuy.moveAction', 'Move my wallet'), run: run(), busy: running }],
        };
      return {
        icon: FiSmartphone,
        title: t('wallet.fiat.pollarBuy.walletTitle', 'Get your wallet ready'),
        body: t('wallet.fiat.pollarBuy.walletBody', 'Your wallet needs one more step before it can receive this deposit.'),
        actions: [{ label: wallet.label, run: run(), busy: running }],
      };
    }
    const trust = rejected.map(rampTrustlineAsset).find((a) => a !== null) ?? null;
    if (trust)
      return {
        icon: FiCheckCircle,
        title: t('wallet.fiat.pollarBuy.trustTitle', 'Enable {{code}} in your wallet', { code: trust.code }),
        body: t('wallet.fiat.pollarBuy.trustBody', 'Your wallet accepts {{code}} once, and from then on it can receive it.', {
          code: trust.code,
        }),
        actions: [
          {
            label: t('wallet.fiat.pollarBuy.enableAsset', 'Enable {{code}}', { code: trust.code }),
            run: () => void trustAsset(trust),
            busy: busy === 'trust',
          },
        ],
      };
    const requirement = rejected.find((r) => r.requirement)?.requirement;
    if (requirement) return requirementStep(requirement);
    return {
      icon: FiClock,
      title: t('wallet.fiat.pollarBuy.noRouteTitle', 'Not right now'),
      body: rampResolutionText(rejected[0]!.failure, language),
      actions: [
        { label: t('wallet.fiat.pollarBuy.changeAmount', 'Change amount'), run: () => setPhase('amount'), variant: 'white' },
      ],
    };
  })();

  const titles: Record<Phase, string> = {
    amount: step
      ? t('wallet.fiat.pollarBuy.stepTitle', 'Before you deposit')
      : t('wallet.fiat.pollarBuy.title', 'Deposit from your bank'),
    quoting: t('wallet.fiat.pollarBuy.title', 'Deposit from your bank'),
    review: step
      ? t('wallet.fiat.pollarBuy.stepTitle', 'Before you deposit')
      : t('wallet.fiat.pollarBuy.reviewTitle', 'Confirm your deposit'),
    details: t('wallet.fiat.pollarBuy.detailsTitle', 'A few details'),
    order:
      order?.state === 'completed'
        ? t('wallet.fiat.pollarBuy.doneTitle', 'Deposit received')
        : t('wallet.fiat.pollarBuy.orderTitle', 'Your deposit'),
  };

  const stepPane = step ? <ModalMessage icon={step.icon} title={step.title} body={step.body} /> : null;
  const stepFooter = step ? (
    <div className="flex w-full flex-col gap-2">
      {step.actions.map((action) => (
        <PressableButton
          key={action.label}
          variant={action.variant ?? 'primary'}
          size="md"
          fullWidth
          onClick={action.run}
          disabled={busy !== null}
        >
          {action.busy ? <Spinner size="sm" color="current" /> : action.label}
        </PressableButton>
      ))}
    </div>
  ) : null;

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (phase === 'order' && order) {
    body = (
      <PollarBuyOrderScreen
        order={order}
        language={language}
        paid={{
          amount: order.legs[0]?.amountInPlanned ?? amount,
          currency: currency || (order.legs[0]?.from.kind === 'fiat' ? order.legs[0].from.currency : ''),
        }}
        error={error}
        pollTrouble={pollTrouble}
        checkingPayment={paymentCheckUntil !== null}
        retrying={busy === 'retry'}
        signing={busy === 'sign'}
        onCheckPayment={() => void checkPayment()}
        onSign={() => void sign()}
        onApprove={openCosign}
        onRetry={() => void retryOrder()}
        onRequote={requote}
        onSetUpRecovery={openWalletRecovery}
        onNewPurchase={newPurchase}
        onDone={onOpenChange}
      />
    );
  } else if (phase === 'details' && selected) {
    const valid = fields.every((f) => f.optional || (fieldValues[f.key] ?? '').trim());
    body = (
      <>
        <p className="text-sm text-gray-600">
          {t('wallet.fiat.pollarBuy.detailsHint', 'The payment provider needs these details to process your deposit.')}
        </p>
        <RampQuoteFields
          fields={fields}
          values={fieldValues}
          onChange={(key, value) => setFieldValues((current) => ({ ...current, [key]: value }))}
          language={language}
          disabled={busy !== null}
          selectPlaceholder={t('wallet.fiat.pollarBuy.select', 'Choose one')}
          optionalLabel={t('wallet.fiat.pollarBuy.optional', 'optional')}
        />
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      </>
    );
    footer = (
      <PressableButton
        variant="success"
        size="md"
        fullWidth
        onClick={() => void startOrder(selected)}
        disabled={!valid || busy !== null}
      >
        {busy === 'order' ? <Spinner size="sm" color="current" /> : t('wallet.fiat.pollarBuy.continue', 'Continue')}
      </PressableButton>
    );
  } else if (phase === 'review' || phase === 'quoting') {
    body =
      phase === 'quoting' ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner size="lg" color="current" />
          <p className="text-sm text-gray-600">{t('wallet.fiat.pollarBuy.quoting', 'Getting the best price…')}</p>
        </div>
      ) : (
        <>
          {best && (
            <>
              <div className="flex flex-col items-center gap-1 py-2 text-center">
                <p className="text-xs text-gray-500">{t('wallet.fiat.onramp.youPay', 'You pay')}</p>
                <p className="text-3xl font-bold text-black">
                  {money(best.amountIn)} {currency}
                </p>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border border-black border-b-2 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-black">{t('wallet.fiat.onramp.routeLabel', 'Payment method')}</span>
                  <span className="text-xs font-semibold text-gray-500">{railsOf(best)}</span>
                </div>
                {quoteRows(best).map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-xs text-gray-500">
                    <span>{row.label}</span>
                    <span className={'font-semibold ' + (row.heavy ? 'text-amber-600' : 'text-black')}>{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-gray-500">
                {priceLeft
                  ? t('wallet.fiat.pollarBuy.priceValidFor', 'Price valid for {{time}}', { time: priceLeft })
                  : t('wallet.fiat.pollarBuy.priceRefreshing', 'Updating the price…')}
              </p>
            </>
          )}
          {!best && !step && (
            <p className="text-sm text-gray-600">
              {t('wallet.fiat.pollarBuy.noRoute', 'There is no way to deposit this amount right now.')}
            </p>
          )}
          {stepPane}
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </>
      );
    footer =
      phase === 'review' ? (
        best ? (
          <PressableButton variant="success" size="md" fullWidth onClick={() => void select(best)} disabled={busy !== null}>
            {busy === 'order' ? <Spinner size="sm" color="current" /> : t('wallet.fiat.pollarBuy.confirm', 'Confirm deposit')}
          </PressableButton>
        ) : step ? (
          stepFooter
        ) : (
          <PressableButton variant="white" size="md" fullWidth onClick={() => setPhase('amount')}>
            {t('wallet.fiat.pollarBuy.changeAmount', 'Change amount')}
          </PressableButton>
        )
      ) : null;
  } else {
    body =
      routes === null ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size="lg" color="current" />
        </div>
      ) : !route ? (
        <p className="text-sm text-gray-600">
          {error ?? t('wallet.fiat.pollarBuy.noCountryRoute', 'Deposits from this country are not available right now.')}
        </p>
      ) : step ? (
        <>
          {stepPane}
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </>
      ) : (
        <AmountStep
          value={amount}
          onValueChange={setAmount}
          decimals={MONEY_INPUT_DECIMALS}
          symbol={currency}
          symbolPosition="suffix"
          error={amountError ?? error}
          onErrorClear={() => {
            setAmountError(null);
            setError(null);
          }}
          hint={t('wallet.fiat.pollarBuy.amountHint', 'How much do you want to deposit, in {{currency}}?', { currency })}
          controls={controls}
        />
      );
    footer = step ? (
      stepFooter
    ) : route ? (
      <PressableButton variant="success" size="md" fullWidth onClick={() => void quote()} disabled={!amount || busy !== null}>
        {t('wallet.fiat.pollarBuy.continue', 'Continue')}
      </PressableButton>
    ) : null;
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      onBack={
        canGoBack
          ? () => setPhase(phase === 'details' ? 'review' : 'amount')
          : onBack && phase === 'amount'
            ? onBack
            : undefined
      }
      isDismissable={false}
      hideClose={busy === 'order'}
      title={titles[phase]}
      size="md"
      // The deposit that landed takes the whole screen: it is the moment to
      // celebrate, not a sheet over the map.
      fullScreen={phase === 'order' && order?.state === 'completed'}
      bodyClassName="flex flex-col gap-4 pb-6"
      footer={footer}
    >
      {body}
    </AppModal>
  );
}
