'use client';

import { Spinner, toast } from '@heroui/react';
import {
  isPollarApiError,
  type CardBalance,
  type CardDepositAddress,
  type CardFunding,
  type CardHolder,
  type CardIncomeRange,
  type CardInfo,
  type CardKycInput,
  type CardOccupation,
  type CardProvider,
  type CardRequirements,
  type CardSecrets,
  type CardTransaction,
} from '@pollar/core';
import { ProviderRegistrationModal, RegistryCheckModal, RequirementFormModal, usePollar } from '@pollar/react';
import type { TFunction } from 'i18next';
import { InputHTMLAttributes, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCopy, FiRefreshCw } from 'react-icons/fi';
import {
  blockedCardStep,
  cardStage,
  pendingFromRequirement,
  requiredCardStep,
  type PendingCardStep,
} from '@/networks/pollar/cardSteps';
import { AppModal } from '../../molecules/AppModal';
import { KycSheet } from '../Kyc/KycSheet';
import { PressableButton } from '../../molecules/PressableButton';

interface CardModalProps {
  open: boolean;
  onOpenChange: () => void;
}

const KYC_POLL_MS = 5_000;
/** How long the revealed number stays on screen. */
const REVEAL_MS = 30_000;
const TX_LIMIT = 10;
const FUNDING_POLL_MS = 5_000;
/** A funding moves through these on its own once paid; CREDITED and FAILED are final. */
const FUNDING_INFLIGHT = new Set(['CREATED', 'BURNED', 'ATTESTED', 'MINTED']);
const FUNDING_STEP: Record<string, number> = { CREATED: 1, BURNED: 2, ATTESTED: 3, MINTED: 4 };
const FUNDING_STEPS = 4;
/** The provider rejects a funding under this, so the button stays off below it. */
const MIN_FUNDING = 1;

const INCOME_RANGES: CardIncomeRange[] = ['0-1000', '1000-5000', '5000-10000', '10000+'];
const KYC_PENDING = new Set(['PENDING', 'NEEDS_ACTION', 'IN_REVIEW']);
const KYC_FINAL = new Set(['DENIED', 'LOCKED', 'CANCELED']);
const TX_TYPES = new Set([
  'deposit',
  'transactionTransfer',
  'spend',
  'spend_adjustment',
  'fee',
  'fee_refund',
  'withdrawal',
  'card_insurance',
]);
/** Errors the user can act on, said plainly instead of the provider's raw message. */
const KNOWN_ERRORS = new Set(['SDK_CARDS_PROVIDER_ERROR', 'SDK_CARDS_IP_NOT_SUPPORTED', 'SDK_CARDS_PROVIDER_USER_TAKEN']);

const emptyKyc: CardKycInput = {
  firstName: '',
  lastName: '',
  birthDate: '',
  nationalId: '',
  countryOfIssue: '',
  phoneCountryCode: '',
  phoneNumber: '',
  occupation: '',
  annualSalary: '1000-5000',
  accountPurpose: '',
  expectedMonthlyVolume: '1000-5000',
  address: { line1: '', line2: '', city: '', region: '', postalCode: '', countryCode: '' },
};

const INPUT_CLASS =
  'w-full rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-gray-400 disabled:opacity-50';

function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function money(amount: string, currency: string): string {
  const n = Number(amount);
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency });
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function groupPan(pan: string): string {
  return pan
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

function errorText(e: unknown, t: TFunction, fallback: string): string {
  if (isPollarApiError(e)) {
    if (KNOWN_ERRORS.has(e.code)) return t(`wallet.card.errors.${e.code}`);
    const { providerMessage, message } = e.body as { providerMessage?: unknown; message?: unknown };
    if (typeof providerMessage === 'string' && providerMessage) return providerMessage;
    if (typeof message === 'string' && message) return message;
    return e.code;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'flex flex-col gap-1.5' + (wide ? ' col-span-2' : '')}>
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-wide text-gray-600 mt-2">{children}</p>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-500">{children}</p>;
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-error bg-error/10 px-3 py-2.5 text-sm text-error" role="alert">
      {children}
    </div>
  );
}

/**
 * The card flow in the app's own chrome: the platform's steps, the provider's
 * KYC form, its verification, issuing, the card with its balance and movements,
 * and funding it from the wallet. It follows Pollar's `CardModal` step for step.
 *
 * The platform steps (KYC, forms, registry checks, provider registration) are
 * Pollar's own modals: while one is open this modal is hidden but stays mounted,
 * so cancelling a step lands the user back on the same screen.
 */
export function CardModal({ open, onOpenChange }: CardModalProps) {
  const { t } = useTranslation();
  const { getClient, wallet } = usePollar();

  const [providers, setProviders] = useState<CardProvider[] | null>(null);
  const [holder, setHolder] = useState<CardHolder | null | undefined>(undefined);
  // undefined while loading; null when the provider has no steps or the server lacks the route.
  const [requirements, setRequirements] = useState<CardRequirements | null | undefined>(undefined);
  const [pendingStep, setPendingStep] = useState<PendingCardStep | null>(null);
  const stepAttempt = useRef<PendingCardStep | null>(null);
  const [cards, setCards] = useState<CardInfo[] | null>(null);
  const [balance, setBalance] = useState<CardBalance | null>(null);
  const [transactions, setTransactions] = useState<CardTransaction[] | null>(null);
  const [deposit, setDeposit] = useState<CardDepositAddress[] | null>(null);
  const [fundings, setFundings] = useState<CardFunding[] | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [occupations, setOccupations] = useState<CardOccupation[]>([]);
  const [kyc, setKyc] = useState<CardKycInput>(emptyKyc);
  const [terms, setTerms] = useState(false);
  const [nickname, setNickname] = useState('');
  const [secrets, setSecrets] = useState<CardSecrets | null>(null);
  const [panel, setPanel] = useState<'card' | 'fund'>('card');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const provider = providers?.[0] ?? null;
  const card = cards?.[0] ?? null;

  // Closing drops the revealed number and returns to the card; the rest reloads on the next open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setSecrets(null);
      setPanel('card');
      setShowManual(false);
      setError('');
    }
  }

  const loadHolder = useCallback(async () => {
    const h = await getClient().getCardHolder();
    setHolder(h);
    return h;
  }, [getClient]);

  const loadRequirements = useCallback(
    async (cardProviderId: string) => {
      try {
        const r = await getClient().getCardRequirements({ cardProviderId });
        setRequirements(r);
        return r;
      } catch {
        setRequirements(null);
        return null;
      }
    },
    [getClient],
  );

  const loadCardData = useCallback(async () => {
    const client = getClient();
    const list = await client.getCards();
    if (list.length === 0) {
      setCards(list);
      return;
    }
    // The card, its balance and its movements land together: no card shown with an empty balance first.
    const [b, tx] = await Promise.all([client.getCardBalance(), client.getCardTransactions({ limit: TX_LIMIT })]);
    setBalance(b);
    setTransactions(tx.transactions);
    setCards(list);
  }, [getClient]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const ps = await getClient().getCardProviders();
        if (cancelled) return;
        setProviders(ps);
        if (ps.length === 0) return;
        const [h] = await Promise.all([loadHolder(), loadRequirements(ps[0]!.id)]);
        if (cancelled) return;
        if (h?.kycStatus === 'APPROVED') await loadCardData();
      } catch (e) {
        if (!cancelled) {
          setProviders((cur) => cur ?? []);
          setError(errorText(e, t, t('wallet.card.errors.load')));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getClient, loadHolder, loadRequirements, loadCardData, t]);

  const stage = cardStage(holder, requirements);

  // The provider's own KYC form: prefill the name from the session once, and load the occupations it accepts.
  const [prefilled, setPrefilled] = useState(false);
  if (open && stage === 'provider-form' && !prefilled) {
    setPrefilled(true);
    const profile = getClient().getUserProfile();
    setKyc((k) => ({
      ...k,
      firstName: k.firstName || profile?.first_name || '',
      lastName: k.lastName || profile?.last_name || '',
    }));
  }
  useEffect(() => {
    if (!open || stage !== 'provider-form') return;
    getClient()
      .getCardOccupations()
      .then(setOccupations)
      .catch(() => setOccupations([]));
  }, [open, stage, getClient]);

  const kycPending = !!holder && KYC_PENDING.has(holder.kycStatus);
  useEffect(() => {
    if (!open || !kycPending) return;
    const id = setInterval(() => {
      loadHolder()
        .then((h) => {
          if (h?.kycStatus === 'APPROVED') void loadCardData();
        })
        .catch(() => {
          // Transient; the next tick retries.
        });
    }, KYC_POLL_MS);
    return () => clearInterval(id);
  }, [open, kycPending, loadHolder, loadCardData]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  function openStep(step: PendingCardStep) {
    stepAttempt.current = step;
    setPendingStep(step);
  }

  async function run(key: string, work: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await work();
    } catch (e) {
      const step = requiredCardStep(e);
      if (step) openStep(step);
      else setError(errorText(e, t, fallback));
    } finally {
      setBusy(null);
    }
  }

  /** After a step: re-read where the user stands, and open the next step when it is theirs to do. */
  async function afterStep() {
    if (!provider) return;
    const [h, r] = await Promise.all([loadHolder(), loadRequirements(provider.id)]);
    if (h?.kycStatus === 'APPROVED') await loadCardData();
    if (r?.next && !blockedCardStep(r.next)) openStep(pendingFromRequirement(provider.id, r.next));
  }

  const start = () =>
    run(
      'start',
      async () => {
        if (!provider) return;
        if (requirements?.next) {
          openStep(pendingFromRequirement(provider.id, requirements.next));
          return;
        }
        if (holder) return afterStep();
        setHolder(await getClient().createCardHolder());
      },
      t('wallet.card.errors.start'),
    );

  const sendKyc = () =>
    run(
      'kyc',
      async () => {
        const address = { ...kyc.address };
        if (!address.line2) delete address.line2;
        setHolder(await getClient().submitCardKyc({ termsAccepted: terms, kyc: { ...kyc, address } }));
      },
      t('wallet.card.errors.kyc'),
    );

  const issue = () =>
    run(
      'issue',
      async () => {
        await getClient().issueCard(nickname.trim() ? { nickname: nickname.trim() } : {});
        await loadCardData();
      },
      t('wallet.card.errors.issue'),
    );

  const refresh = () => run('refresh', loadCardData, t('wallet.card.errors.refresh'));

  const reveal = () =>
    run(
      'reveal',
      async () => {
        if (!card) return;
        const s = await getClient().revealCardSecrets(card.id);
        setSecrets(s);
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => setSecrets(null), REVEAL_MS);
      },
      t('wallet.card.errors.reveal'),
    );

  const openFund = () =>
    run(
      'fund',
      async () => {
        setFundings(await getClient().listCardFundings());
        setPanel('fund');
      },
      t('wallet.card.errors.fundings'),
    );

  const fund = () =>
    run(
      'fund-send',
      async () => {
        const outcome = await getClient().fundCard({ amount: fundAmount.trim() });
        if (outcome.status === 'cancelled') {
          setError(t('wallet.card.errors.notSigned'));
          return;
        }
        setFundings((cur) => [outcome.funding, ...(cur ?? []).filter((f) => f.id !== outcome.funding.id)]);
        setFundAmount('');
      },
      t('wallet.card.errors.fund'),
    );

  const showManualAddress = () =>
    run(
      'fund-manual',
      async () => {
        if (!deposit) setDeposit(await getClient().getCardDepositAddresses());
        setShowManual(true);
      },
      t('wallet.card.errors.depositAddress'),
    );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('wallet.page.addressCopied'));
    } catch (e) {
      toast.danger(t('wallet.page.copyError'), { description: (e as { message?: string })?.message ?? '' });
    }
  };

  // Fundings advance on their own server-side; keep the panel current while any is in flight.
  const fundingsInflight = (fundings ?? []).some((f) => FUNDING_INFLIGHT.has(f.status));
  useEffect(() => {
    if (!open || panel !== 'fund' || !fundingsInflight) return;
    const id = setInterval(() => {
      getClient()
        .listCardFundings()
        .then((next) => {
          setFundings((previous) => {
            // A funding that just got credited moves the card's balance: re-read it.
            const credited = next.some(
              (f) => f.status === 'CREDITED' && previous?.find((p) => p.id === f.id)?.status !== 'CREDITED',
            );
            if (credited) void loadCardData().catch(() => {});
            return next;
          });
        })
        .catch(() => {
          // Transient; the next tick retries.
        });
    }, FUNDING_POLL_MS);
    return () => clearInterval(id);
  }, [open, panel, fundingsInflight, getClient, loadCardData]);

  const kycField = (
    key: keyof Omit<CardKycInput, 'address' | 'email' | 'annualSalary' | 'expectedMonthlyVolume'>,
    extra: InputHTMLAttributes<HTMLInputElement> = {},
    wide = false,
  ) => (
    <Field label={t(`wallet.card.kyc.${key}`)} wide={wide}>
      <input
        className={INPUT_CLASS}
        value={kyc[key]}
        onChange={(e) => setKyc((k) => ({ ...k, [key]: e.target.value }))}
        disabled={busy !== null}
        {...extra}
      />
    </Field>
  );

  const addressField = (
    key: keyof CardKycInput['address'],
    extra: InputHTMLAttributes<HTMLInputElement> = {},
    wide = false,
  ) => (
    <Field label={t(`wallet.card.address.${key}`)} wide={wide}>
      <input
        className={INPUT_CLASS}
        value={kyc.address[key] ?? ''}
        onChange={(e) => setKyc((k) => ({ ...k, address: { ...k.address, [key]: e.target.value } }))}
        disabled={busy !== null}
        {...extra}
      />
    </Field>
  );

  const rangeField = (key: 'annualSalary' | 'expectedMonthlyVolume') => (
    <Field label={t(`wallet.card.kyc.${key}`)}>
      <select
        className={INPUT_CLASS}
        value={kyc[key]}
        onChange={(e) => setKyc((k) => ({ ...k, [key]: e.target.value as CardIncomeRange }))}
        disabled={busy !== null}
      >
        {INCOME_RANGES.map((r) => (
          <option key={r} value={r}>
            {t(`wallet.card.income.${r}`)}
          </option>
        ))}
      </select>
    </Field>
  );

  const kycComplete =
    !!kyc.firstName &&
    !!kyc.lastName &&
    /^\d{4}-\d{2}-\d{2}$/.test(kyc.birthDate) &&
    !!kyc.nationalId &&
    kyc.countryOfIssue.length === 2 &&
    !!kyc.phoneCountryCode &&
    !!kyc.phoneNumber &&
    !!kyc.occupation &&
    !!kyc.accountPurpose &&
    !!kyc.address.line1 &&
    !!kyc.address.city &&
    !!kyc.address.region &&
    !!kyc.address.postalCode &&
    kyc.address.countryCode.length === 2;

  // --- Platform steps, in place of this modal ---------------------------------
  let stepModal: ReactNode = null;
  if (open && pendingStep) {
    const close = () => {
      stepAttempt.current = null;
      setPendingStep(null);
    };
    const done = () => {
      // Ignore a step that finishes after it was cancelled or replaced.
      if (stepAttempt.current !== pendingStep) return;
      close();
      void afterStep();
    };
    const progress = pendingStep.progress ? { progress: pendingStep.progress } : {};
    if (pendingStep.type === 'FORM') {
      stepModal = <RequirementFormModal formId={pendingStep.optionId} {...progress} onClose={close} onSubmitted={done} />;
    } else if (pendingStep.type === 'REGISTRY_CHECK') {
      stepModal = <RegistryCheckModal optionId={pendingStep.optionId} {...progress} onClose={close} onApproved={done} />;
    } else if (pendingStep.type === 'PROVIDER_REGISTRATION') {
      stepModal = (
        <ProviderRegistrationModal
          cardProviderId={pendingStep.cardProviderId}
          {...progress}
          onClose={close}
          onRegistered={done}
        />
      );
    } else {
      stepModal = (
        <KycSheet
          cardProviderId={pendingStep.cardProviderId}
          providerId={pendingStep.optionId}
          onClose={close}
          onApproved={done}
        />
      );
    }
  }

  // An approved holder also waits for its card data, so the modal never shows blank between the holder and the card.
  const loading =
    providers === null ||
    (providers.length > 0 && (holder === undefined || requirements === undefined)) ||
    (holder?.kycStatus === 'APPROVED' && cards === null && !error);
  const blocked = requirements?.next ? blockedCardStep(requirements.next) : null;
  const title =
    panel === 'fund'
      ? t('wallet.card.fund.title')
      : card
        ? (card.nickname ?? t('wallet.card.yourCard'))
        : t('wallet.card.title');
  const cardLabel = provider ? (provider.cardLabel ?? t('wallet.card.providerCard', { name: provider.name })) : '';

  let footer: ReactNode = null;
  if (!loading && provider?.available && stage === 'steps') {
    footer = (
      <PressableButton
        variant="success"
        size="cta"
        onClick={() => void start()}
        disabled={busy !== null || !wallet || !!blocked}
      >
        {busy === 'start' ? <Spinner size="sm" color="current" /> : null}
        {requirements?.next ? t('wallet.card.continue') : t('wallet.card.start')}
      </PressableButton>
    );
  } else if (!loading && provider && stage === 'provider-form') {
    footer = (
      <PressableButton
        variant="success"
        size="cta"
        onClick={() => void sendKyc()}
        disabled={busy !== null || !terms || !kycComplete}
      >
        {busy === 'kyc' ? <Spinner size="sm" color="current" /> : null}
        {t('wallet.card.continue')}
      </PressableButton>
    );
  } else if (!loading && provider && holder?.kycStatus === 'APPROVED' && cards !== null && !card) {
    footer = (
      <PressableButton variant="success" size="cta" onClick={() => void issue()} disabled={busy !== null}>
        {busy === 'issue' ? <Spinner size="sm" color="current" /> : null}
        {t('wallet.card.issue.cta')}
      </PressableButton>
    );
  } else if (!loading && provider && card && panel === 'fund') {
    footer = (
      <PressableButton
        variant="success"
        size="cta"
        onClick={() => void fund()}
        disabled={busy !== null || !(Number(fundAmount) >= MIN_FUNDING)}
      >
        {busy === 'fund-send' ? <Spinner size="sm" color="current" /> : null}
        {t('wallet.card.fund.cta')}
      </PressableButton>
    );
  }

  return (
    <>
      <AppModal
        open={open && !pendingStep}
        onOpenChange={onOpenChange}
        title={title}
        size="md"
        // Money flows close only from the X, never by tapping outside.
        isDismissable={false}
        onBack={panel === 'fund' ? () => setPanel('card') : undefined}
        bodyClassName="flex flex-col gap-4 pb-6"
        footer={footer}
      >
        {loading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!loading && providers?.length === 0 && !error && <ErrorBox>{t('wallet.card.unavailable')}</ErrorBox>}
        {!loading && provider && !provider.available && <ErrorBox>{t('wallet.card.unavailableNow')}</ErrorBox>}

        {/* The platform's steps, then the provider sign-up. */}
        {!loading && provider?.available && stage === 'steps' && (
          <>
            <p className="text-sm text-black">{t('wallet.card.intro', { card: cardLabel })}</p>
            {requirements && requirements.total > 0 && (
              <Note>{t('wallet.card.stepsProgress', { done: requirements.completed, total: requirements.total })}</Note>
            )}
            {blocked && <ErrorBox>{t(`wallet.card.blocked.${blocked}`)}</ErrorBox>}
          </>
        )}

        {/* The provider's own KYC form, when no PROVIDER_REGISTRATION step sends it for the user. */}
        {!loading && provider && stage === 'provider-form' && (
          <>
            <SectionTitle>{t('wallet.card.kyc.aboutYou')}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {kycField('firstName', { autoComplete: 'given-name' })}
              {kycField('lastName', { autoComplete: 'family-name' })}
              {kycField('birthDate', { type: 'date', autoComplete: 'bday' })}
              {kycField('nationalId')}
              {kycField('countryOfIssue', {
                maxLength: 2,
                placeholder: 'BO',
                onChange: (e) => setKyc((k) => ({ ...k, countryOfIssue: e.target.value.toUpperCase() })),
              })}
              <Field label={t('wallet.card.kyc.occupation')}>
                <select
                  className={INPUT_CLASS}
                  value={kyc.occupation}
                  onChange={(e) => setKyc((k) => ({ ...k, occupation: e.target.value }))}
                  disabled={busy !== null}
                >
                  <option value="">{t('wallet.card.kyc.select')}</option>
                  {occupations.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              {kycField('phoneCountryCode', { placeholder: '591', inputMode: 'numeric' })}
              {kycField('phoneNumber', { placeholder: '71234567', inputMode: 'numeric', autoComplete: 'tel-national' })}
              {rangeField('annualSalary')}
              {rangeField('expectedMonthlyVolume')}
              {kycField('accountPurpose', { placeholder: t('wallet.card.kyc.accountPurposePlaceholder') }, true)}
            </div>

            <SectionTitle>{t('wallet.card.address.title')}</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {addressField('line1', { autoComplete: 'address-line1' }, true)}
              {addressField('line2', { autoComplete: 'address-line2' }, true)}
              {addressField('city', { autoComplete: 'address-level2' })}
              {addressField('region', { autoComplete: 'address-level1' })}
              {addressField('postalCode', { autoComplete: 'postal-code' })}
              {addressField('countryCode', {
                maxLength: 2,
                placeholder: 'BO',
                onChange: (e) =>
                  setKyc((k) => ({ ...k, address: { ...k.address, countryCode: e.target.value.toUpperCase() } })),
              })}
            </div>

            <label className="flex items-start gap-2.5 text-sm text-black">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-black"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />
              <span>
                {t('wallet.card.kyc.termsPrefix')}{' '}
                {provider.termsUrl ? (
                  <a className="font-semibold underline" href={provider.termsUrl} target="_blank" rel="noreferrer">
                    {t('wallet.card.kyc.termsLink', { name: provider.name })}
                  </a>
                ) : (
                  <span className="font-semibold">{t('wallet.card.kyc.termsLink', { name: provider.name })}</span>
                )}
              </span>
            </label>
          </>
        )}

        {/* The provider's verification, pending. */}
        {!loading && holder && KYC_PENDING.has(holder.kycStatus) && (
          <>
            <p className="text-sm text-black">{t(`wallet.card.verification.${holder.kycStatus}`)}</p>
            {holder.kycReason && <Note>{holder.kycReason}</Note>}
            <div className="flex flex-col gap-2">
              {holder.verificationLink && (
                <PressableButton
                  variant="primary"
                  fullWidth
                  onClick={() => window.open(holder.verificationLink!, '_blank', 'noopener,noreferrer')}
                >
                  {t('wallet.card.verification.verify')}
                </PressableButton>
              )}
              <PressableButton variant="white" fullWidth onClick={() => void loadHolder().catch(() => {})}>
                {t('wallet.card.verification.done')}
              </PressableButton>
            </div>
            <Note>{t('wallet.card.verification.autoUpdate')}</Note>
          </>
        )}

        {!loading && holder && KYC_FINAL.has(holder.kycStatus) && (
          <ErrorBox>
            {t(`wallet.card.verification.${holder.kycStatus}`)}
            {holder.kycReason ? ` ${holder.kycReason}` : ''}
          </ErrorBox>
        )}

        {/* Approved, no card yet. */}
        {!loading && provider && holder?.kycStatus === 'APPROVED' && cards !== null && !card && (
          <>
            <p className="text-sm text-black">{t('wallet.card.issue.body')}</p>
            <Field label={t('wallet.card.issue.nickname')}>
              <input
                className={INPUT_CLASS}
                value={nickname}
                maxLength={40}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t('wallet.card.issue.nicknamePlaceholder')}
                disabled={busy !== null}
              />
            </Field>
          </>
        )}

        {/* The card. */}
        {!loading && provider && card && panel === 'card' && (
          <>
            <div className="relative overflow-hidden rounded-xl border border-black border-b-4 bg-black p-5 text-white aspect-[1.586] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{cardLabel}</span>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {t(`wallet.card.status.${card.status}`)}
                </span>
              </div>
              <div className="h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500" />
              <p className="font-mono text-lg tracking-widest">
                {secrets ? groupPan(secrets.pan) : `•••• •••• •••• ${card.last4 ?? '••••'}`}
              </p>
              <div className="flex gap-6 text-xs">
                <div className="flex flex-col">
                  <span className="text-white/60">{t('wallet.card.expires')}</span>
                  <strong className="font-mono">
                    {card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : '--/--'}
                  </strong>
                </div>
                <div className="flex flex-col">
                  <span className="text-white/60">CVC</span>
                  <strong className="font-mono">{secrets ? secrets.cvc : '•••'}</strong>
                </div>
                <div className="ml-auto flex flex-col items-end">
                  <span className="text-white/60">{t(`wallet.card.type.${card.type}`)}</span>
                  <strong>{card.currency}</strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-black border-b-2 bg-white p-3 text-center">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">{t('wallet.card.balance.available')}</span>
                <strong className="text-sm text-black">{usd(balance?.spendingPowerCents)}</strong>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">{t('wallet.card.balance.limit')}</span>
                <strong className="text-sm text-black">{usd(balance?.creditLimitCents)}</strong>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">{t('wallet.card.balance.due')}</span>
                <strong className="text-sm text-black">{usd(balance?.balanceDueCents)}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {provider.supports.revealSecrets &&
                (secrets ? (
                  <PressableButton variant="white" onClick={() => setSecrets(null)}>
                    {t('wallet.card.hideDetails')}
                  </PressableButton>
                ) : (
                  <PressableButton variant="white" onClick={() => void reveal()} disabled={busy !== null}>
                    {busy === 'reveal' ? <Spinner size="sm" color="current" /> : t('wallet.card.showDetails')}
                  </PressableButton>
                ))}
              <PressableButton
                variant="success"
                onClick={() => void openFund()}
                disabled={busy !== null}
                className={provider.supports.revealSecrets ? '' : 'col-span-2'}
              >
                {busy === 'fund' ? <Spinner size="sm" color="current" /> : t('wallet.card.fund.open')}
              </PressableButton>
            </div>
            {secrets && <Note>{t('wallet.card.detailsHint')}</Note>}

            <div className="flex items-center justify-between">
              <SectionTitle>{t('wallet.card.activity')}</SectionTitle>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={busy !== null}
                aria-label={t('wallet.card.refresh')}
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-black/5 hover:text-black transition disabled:opacity-50"
              >
                <FiRefreshCw className={'h-4 w-4' + (busy === 'refresh' ? ' animate-spin' : '')} />
              </button>
            </div>
            {transactions?.length === 0 && <Note>{t('wallet.card.noActivity')}</Note>}
            {transactions && transactions.length > 0 && (
              <ul className="flex flex-col divide-y divide-gray-200 rounded-lg border border-black border-b-2 bg-white">
                {transactions.map((tx) => {
                  const purchase = tx.purchase as {
                    localAmount?: number | null;
                    localCurrency?: string | null;
                    status?: string;
                  } | null;
                  const local =
                    purchase?.localAmount && purchase.localCurrency && purchase.localCurrency !== 'USD'
                      ? money(String(purchase.localAmount), purchase.localCurrency)
                      : null;
                  const typeLabel = TX_TYPES.has(tx.type) ? t(`wallet.card.txType.${tx.type}`) : tx.type;
                  return (
                    <li key={tx.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-black">{tx.merchantName ?? typeLabel}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(tx.occurredAt).toLocaleDateString()}
                          {tx.merchantName ? ` · ${typeLabel}` : ''}
                          {purchase?.status && purchase.status !== 'completed' ? ` · ${purchase.status}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={'text-sm font-semibold ' + (tx.direction === 'credit' ? 'text-[#018222]' : 'text-black')}>
                          {tx.direction === 'credit' ? '+' : tx.direction === 'debit' ? '-' : ''}
                          {money(tx.amount, tx.currency)}
                        </p>
                        {local && <p className="text-xs text-gray-500">{local}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* Funding. */}
        {!loading && provider && card && panel === 'fund' && (
          <>
            <p className="text-sm text-black">
              {t('wallet.card.fund.body', { assets: provider.fundingAssets.join(' / ') || 'USDC' })}
            </p>
            <Field label={t('wallet.card.fund.amount')}>
              <input
                className={INPUT_CLASS + ' font-mono text-lg'}
                inputMode="decimal"
                placeholder="10"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                disabled={busy !== null}
              />
            </Field>

            {fundings && fundings.length > 0 && (
              <>
                <SectionTitle>{t('wallet.card.fund.history')}</SectionTitle>
                <ul className="flex flex-col divide-y divide-gray-200 rounded-lg border border-black border-b-2 bg-white">
                  {fundings.map((f) => {
                    const inflight = FUNDING_INFLIGHT.has(f.status);
                    const known = inflight || f.status === 'CREDITED' || f.status === 'FAILED';
                    return (
                      <li key={f.id} className="flex items-start justify-between gap-3 px-3 py-2.5" aria-busy={inflight}>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-black">
                            {inflight && <Spinner size="sm" color="current" />}
                            {known ? t(`wallet.card.funding.${f.status}.title`) : f.status}
                          </p>
                          {inflight && (
                            <p className="text-xs text-gray-500" role="status">
                              {t('wallet.card.funding.step', { step: FUNDING_STEP[f.status], total: FUNDING_STEPS })} ·{' '}
                              {t(`wallet.card.funding.${f.status}.hint`)}
                            </p>
                          )}
                          <p className="text-xs text-gray-500">
                            {new Date(f.createdAt).toLocaleString()}
                            {f.status === 'FAILED' && f.error ? ` · ${f.error}` : ''}
                          </p>
                        </div>
                        <p
                          className={
                            'shrink-0 text-sm font-semibold ' + (f.status === 'CREDITED' ? 'text-[#018222]' : 'text-black')
                          }
                        >
                          {money(f.amount, 'USD')}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                {fundingsInflight && <Note>{t('wallet.card.fund.canClose')}</Note>}
              </>
            )}

            {!showManual ? (
              <button
                type="button"
                className="self-start text-xs font-semibold text-black underline disabled:opacity-50"
                onClick={() => void showManualAddress()}
                disabled={busy !== null}
              >
                {t('wallet.card.fund.showAddress')}
              </button>
            ) : (
              <>
                {deposit?.map((d) => (
                  <div key={d.network} className="flex flex-col gap-2 rounded-lg border border-black border-b-2 bg-white p-3">
                    <p className="text-sm font-semibold text-black">
                      {d.network} <span className="font-normal text-gray-500">(chain {d.chainId})</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 break-all font-mono text-xs text-black">{d.address}</code>
                      <button
                        type="button"
                        onClick={() => void copy(d.address)}
                        aria-label={t('wallet.page.copy')}
                        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md border border-black border-b-2 bg-[#DDF4FF] text-black hover:bg-[#c4ecff] transition"
                      >
                        <FiCopy className="h-4 w-4" />
                      </button>
                    </div>
                    <Note>
                      {t('wallet.card.fund.addressWarning', {
                        tokens: d.tokens.map((tk) => (tk.currency ?? 'token').toUpperCase()).join(' / '),
                        network: d.network,
                      })}
                    </Note>
                  </div>
                ))}
                {deposit?.length === 0 && <ErrorBox>{t('wallet.card.fund.noAddress')}</ErrorBox>}
                <button
                  type="button"
                  className="self-start text-xs font-semibold text-black underline"
                  onClick={() => setShowManual(false)}
                >
                  {t('wallet.card.fund.hideAddress')}
                </button>
              </>
            )}
          </>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}
      </AppModal>
      {stepModal}
    </>
  );
}
