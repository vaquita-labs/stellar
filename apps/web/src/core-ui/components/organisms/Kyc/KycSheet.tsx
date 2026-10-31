'use client';

import { isPollarApiError, type KycProvider } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheckCircle, FiClock, FiExternalLink, FiShield } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { ModalMessage } from '../../molecules/ModalMessage';
import { PressableButton } from '../../molecules/PressableButton';

export interface KycSheetProps {
  onClose: () => void;
  /** Called once the user is verified; the sheet also shows it. */
  onApproved: () => void;
  /** The verification option a provider named as the pending step. */
  providerId?: string;
  /** ISO 3166-1 alpha-2, when the flow knows it (bank deposits). */
  country?: string;
  /** Scope to a ramp route's steps. */
  corridorId?: string;
  /** Scope to a card provider's steps. */
  cardProviderId?: string;
}

/** The SDK's own default when a caller gives no country (card steps). */
const DEFAULT_COUNTRY = 'MX';
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

type Session = { sessionId: string; kycUrl?: string };

type Phase =
  | { kind: 'starting' }
  | { kind: 'failed'; message: string }
  | { kind: 'verifying'; session: Session; flow: KycProvider['flow']; notConfirmed: boolean }
  | { kind: 'polling' }
  | { kind: 'done'; status: 'approved' | 'processing' | 'review' | 'duplicate' | 'rejected' | 'expired' };

type StatusRead = {
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'expired';
  decisionStatus?: 'pending' | 'manual_review' | 'approved' | 'rejected' | 'expired';
  reviewReason?: string;
};

/** What a status read means for the user, in the sheet's own terms. */
function outcomeOf(read: StatusRead): Extract<Phase, { kind: 'done' }>['status'] {
  if (read.status === 'approved') return 'approved';
  if (read.status === 'pending' && read.decisionStatus === 'approved') return 'processing';
  if (read.decisionStatus === 'manual_review') return read.reviewReason === 'DUPLICATE_DOCUMENT' ? 'duplicate' : 'review';
  if (read.decisionStatus === 'expired' || read.status === 'expired') return 'expired';
  if (read.status === 'rejected') return 'rejected';
  return 'review';
}

/**
 * Vaquita's identity verification, in place of the SDK's KYC modal. The
 * provider is never named: the user verifies "with Vaquita", inside the sheet
 * when the provider embeds, in a new tab when it does not. Starts on open with
 * the step the caller names, then waits for the user to say they finished and
 * asks the platform for the decision.
 */
export function KycSheet({ onClose, onApproved, providerId, country, corridorId, cardProviderId }: KycSheetProps) {
  const { t } = useTranslation();
  const { getClient } = usePollar();
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const provider = useRef<KycProvider | null>(null);
  // One key per provider so a retried start resumes the same session; dropped
  // when the platform says that session expired.
  const idempotencyKeys = useRef<Record<string, string>>({});
  const starting = useRef(false);

  const readStatus = (id: string): Promise<StatusRead> => {
    const client = getClient();
    return corridorId || cardProviderId ? client.getKycStatus(undefined, corridorId, cardProviderId) : client.getKycStatus(id);
  };

  const finishWith = (read: StatusRead) => {
    const status = outcomeOf(read);
    setPhase({ kind: 'done', status });
    if (status === 'approved') onApproved();
  };

  const start = async (target: KycProvider, listed: boolean) => {
    if (starting.current) return;
    starting.current = true;
    provider.current = target;
    setPhase({ kind: 'starting' });
    const keys = idempotencyKeys.current;
    const key = (keys[target.id] ??= crypto.randomUUID());
    try {
      const result = await getClient().resolveKyc(
        target.id,
        target.levels?.[0] ?? 'basic',
        listed ? (country ?? DEFAULT_COUNTRY) : undefined,
        corridorId,
        key,
        cardProviderId,
      );
      if (result.alreadyApproved) {
        finishWith({ status: 'approved' });
        return;
      }
      if (!result.sessionId) throw new Error('no session');
      setPhase({
        kind: 'verifying',
        session: { sessionId: result.sessionId, ...(result.kycUrl ? { kycUrl: result.kycUrl } : {}) },
        flow: target.flow,
        notConfirmed: false,
      });
    } catch (e) {
      const code = isPollarApiError(e) ? e.code : undefined;
      if (code === 'SDK_KYC_ALREADY_APPROVED') {
        finishWith({ status: 'approved' });
        return;
      }
      if (code === 'SDK_KYC_UNDER_REVIEW') {
        await readStatus(target.id).then(finishWith, () => setPhase({ kind: 'done', status: 'review' }));
        return;
      }
      if (code === 'SDK_KYC_SESSION_EXPIRED') delete keys[target.id];
      setPhase({
        kind: 'failed',
        message: t('kyc.startFailed', 'We could not start your verification. Try again in a moment.'),
      });
    } finally {
      starting.current = false;
    }
  };

  const load = async () => {
    setPhase({ kind: 'starting' });
    let providers: KycProvider[] = [];
    try {
      providers = (await getClient().getKycProviders(country ?? DEFAULT_COUNTRY, corridorId, cardProviderId)).providers;
    } catch {
      providers = [];
    }
    const listed = providerId ? providers.find((p) => p.id === providerId) : providers[0];
    if (listed) return start(listed, true);
    if (providerId) return start({ id: providerId, name: '', flow: 'iframe', levels: ['basic'] }, false);
    setPhase({ kind: 'failed', message: t('kyc.unavailable', 'Verification is not available right now. Try again later.') });
  };

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void load();
    // Runs once per mount: the sheet is mounted for one verification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = async () => {
    const target = provider.current;
    if (!target) return;
    const before = phase;
    setPhase({ kind: 'polling' });
    try {
      const read = await getClient().pollKycDecision(target.id, {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs: POLL_TIMEOUT_MS,
        ...(corridorId ? { corridorId } : {}),
        ...(cardProviderId ? { cardProviderId } : {}),
      });
      finishWith(read);
    } catch {
      setPhase(before.kind === 'verifying' ? { ...before, notConfirmed: true } : { kind: 'done', status: 'review' });
    }
  };

  const startAgain = () => {
    const target = provider.current;
    if (!target) return void load();
    delete idempotencyKeys.current[target.id];
    void start(target, true);
  };

  const busy = phase.kind === 'starting' || phase.kind === 'polling';
  const embedded = phase.kind === 'verifying' && phase.flow !== 'redirect' && !!phase.session.kycUrl;

  const closeButton = (
    <PressableButton variant="white" size="md" fullWidth onClick={onClose}>
      {t('common.close', 'Close')}
    </PressableButton>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  switch (phase.kind) {
    case 'starting':
      body = (
        <ModalMessage
          figure={<Spinner />}
          title={t('kyc.startingTitle', 'Getting your verification ready')}
          body={t('kyc.startingBody', 'It only takes a moment.')}
        />
      );
      break;
    case 'failed':
      body = <ModalMessage icon={FiAlertCircle} title={t('kyc.failedTitle', 'Something went wrong')} body={phase.message} />;
      footer = (
        <div className="flex w-full gap-2">
          {closeButton}
          <PressableButton variant="primary" size="md" fullWidth onClick={startAgain}>
            {t('kyc.tryAgain', 'Try again')}
          </PressableButton>
        </div>
      );
      break;
    case 'verifying': {
      const url = phase.session.kycUrl;
      body = embedded ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <iframe
            className="min-h-[60vh] w-full flex-1 rounded-2xl bg-white"
            src={url}
            title={t('kyc.title', 'Verify your identity')}
            allow="camera; microphone"
          />
          {phase.notConfirmed && (
            <p className="text-center text-sm text-gray-600">
              {t('kyc.notConfirmed', 'We could not confirm it yet. Finish the steps and try again.')}
            </p>
          )}
        </div>
      ) : (
        <ModalMessage
          icon={FiShield}
          title={t('kyc.openTitle', 'Verify in a new tab')}
          body={
            phase.notConfirmed
              ? t('kyc.notConfirmed', 'We could not confirm it yet. Finish the steps and try again.')
              : t('kyc.openBody', 'Have your ID at hand. When you finish, come back here and tap "I am done".')
          }
        >
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-2 rounded-xl border border-black border-b-3 bg-primary px-4 py-2 text-sm font-bold text-black transition active:border-b-[1px] active:translate-y-[2px]"
            >
              <FiExternalLink className="h-4 w-4" />
              {t('kyc.openVerification', 'Open verification')}
            </a>
          )}
        </ModalMessage>
      );
      footer = (
        <div className="flex w-full gap-2">
          {closeButton}
          <PressableButton variant="primary" size="md" fullWidth onClick={() => void check()}>
            {t('kyc.done', 'I am done')}
          </PressableButton>
        </div>
      );
      break;
    }
    case 'polling':
      body = (
        <ModalMessage
          figure={<Spinner />}
          title={t('kyc.checkingTitle', 'Checking your verification')}
          body={t('kyc.checkingBody', 'This can take up to a couple of minutes.')}
        />
      );
      break;
    case 'done': {
      const copy = {
        approved: {
          icon: FiCheckCircle,
          title: t('kyc.approvedTitle', 'Identity verified'),
          body: t('kyc.approvedBody', 'You are all set to keep going.'),
        },
        processing: {
          icon: FiClock,
          title: t('kyc.processingTitle', 'Almost there'),
          body: t('kyc.processingBody', 'Your verification was approved and is being finalized. Check again in a moment.'),
        },
        review: {
          icon: FiClock,
          title: t('kyc.reviewTitle', 'Your verification is under review'),
          body: t('kyc.reviewBody', 'It usually takes little time. We will let you know when it is ready.'),
        },
        duplicate: {
          icon: FiAlertCircle,
          title: t('kyc.duplicateTitle', 'That document is already in use'),
          body: t('kyc.duplicateBody', 'It is linked to another account. Write to us and we will sort it out.'),
        },
        rejected: {
          icon: FiAlertCircle,
          title: t('kyc.rejectedTitle', 'We could not verify your identity'),
          body: t('kyc.rejectedBody', 'Write to us from Help and we will look into it with you.'),
        },
        expired: {
          icon: FiClock,
          title: t('kyc.expiredTitle', 'Your verification expired'),
          body: t('kyc.expiredBody', 'Start again whenever you want. It only takes a few minutes.'),
        },
      }[phase.status];
      body = <ModalMessage icon={copy.icon} title={copy.title} body={copy.body} />;
      footer =
        phase.status === 'expired' ? (
          <div className="flex w-full gap-2">
            {closeButton}
            <PressableButton variant="primary" size="md" fullWidth onClick={startAgain}>
              {t('kyc.startAgain', 'Start again')}
            </PressableButton>
          </div>
        ) : phase.status === 'processing' || phase.status === 'review' ? (
          <div className="flex w-full gap-2">
            {closeButton}
            <PressableButton variant="primary" size="md" fullWidth onClick={() => void check()}>
              {t('kyc.checkAgain', 'Check again')}
            </PressableButton>
          </div>
        ) : (
          <PressableButton variant="primary" size="md" fullWidth onClick={onClose}>
            {t('common.close', 'Close')}
          </PressableButton>
        );
      break;
    }
  }

  return (
    <AppModal
      open
      onOpenChange={onClose}
      title={t('kyc.title', 'Verify your identity')}
      size="md"
      fullScreen={embedded}
      isDismissable={!busy && !embedded}
      hideClose={busy}
      bodyClassName={embedded ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col gap-3'}
      footer={footer}
    >
      {body}
    </AppModal>
  );
}
