'use client';

import {
  type CosignRequest,
  cosignRefusalMessage,
  isPollarApiError,
  type PollarLanguage,
  transactionErrorMessage,
} from '@pollar/core';
import { usePollar } from '@pollar/react';
import { Spinner, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiCheckCircle, FiFileText, FiRepeat, FiSend, FiShield, FiSmartphone } from 'react-icons/fi';
import { useNowEverySecond } from '../../../hooks/useNowEverySecond';
import { openWalletRecovery } from '../../../stores';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { ModalMessage } from '../../molecules/ModalMessage';
import { Notice } from '../../molecules/Notice';
import { PressableButton } from '../../molecules/PressableButton';

const POLLAR_LANGUAGES: PollarLanguage[] = ['en', 'es', 'pt'];

function errorText(err: unknown, language: PollarLanguage): string {
  return (
    cosignRefusalMessage(err, language) ??
    transactionErrorMessage(isPollarApiError(err) ? err.code : null, err instanceof Error ? err.message : null, language)
  );
}

const asString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

interface CosignSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Vaquita's version of the SDK's cosign modal (`modals.cosign: false` on
 * `PollarProvider`). A co-signed wallet signs nothing without this device's
 * vote; the signatures the app asks for are voted by the SDK itself, so what
 * reaches this sheet is the odd request: an account on another chain so a
 * deposit can land, an asset to enable, a step of a ramp order. Each one is
 * said in the user's terms (what it is for, that it moves no funds), with no
 * chain names or payloads, and one Approve.
 * The request is verified on this device before Approve turns on, and the
 * SDK verifies it again when voting.
 */
export function CosignSheet({ open, onClose }: CosignSheetProps) {
  // Mounted while visible (through the exit animation) and dropped after, so
  // every opening starts from the current request with nothing left over.
  const present = useModalPresence(open);
  if (!present) return null;
  return <CosignScreen open={open} onClose={onClose} />;
}

function CosignScreen({ open, onClose }: CosignSheetProps) {
  const { t, i18n } = useTranslation();
  const language = POLLAR_LANGUAGES.find((l) => i18n.language.startsWith(l)) ?? 'en';
  const { getClient, cosign, wallet } = usePollar();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = cosign.pending;
  const current = pending[0] ?? null;
  const currentId = current?.id ?? null;

  // The wallet as this device reads it: a device that is not one of its
  // credentials cannot vote, and a wallet that is not the promised quorum must
  // not be voted on. Read fresh on every opening.
  const quorum = useQuery({
    queryKey: ['cosign-quorum', wallet?.address ?? ''],
    queryFn: () => getClient().cosign.inspectQuorum(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  const deviceNotLinked = quorum.data?.ok === false && quorum.data.code === 'DEVICE_NOT_ENROLLED';
  const quorumFailure = quorum.data?.ok === false && !deviceNotLinked ? quorum.data.reason : null;

  // Verified per request, never reused for another one.
  const verification = useQuery({
    queryKey: ['cosign-verify', currentId],
    queryFn: () => getClient().cosign.verify(current!),
    enabled: current !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const verified = verification.data?.ok === true && !quorumFailure && !deviceNotLinked;
  const verifyFailure = quorumFailure ?? (verification.data?.ok === false ? verification.data.reason : null);

  const now = useNowEverySecond(current !== null);
  const msLeft = current ? Date.parse(current.expiresAt) - now : 0;
  const expired = current !== null && msLeft <= 0;
  const timeLeft = (() => {
    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.max(1, Math.floor((msLeft % 3_600_000) / 60_000));
    return h > 0 ? t('cosign.hoursMinutes', '{{h}} h {{m}} min', { h, m }) : t('cosign.minutes', '{{m}} min', { m });
  })();

  /** Nothing left to vote on: close. Something still pending: it shows next. */
  const closeIfDone = async () => {
    const left = await getClient()
      .cosign.pending()
      .catch(() => null);
    if (left && left.length === 0) onClose();
  };

  const approve = async (request: CosignRequest) => {
    setBusy('approve');
    setError(null);
    try {
      const client = getClient();
      const resolved = await client.cosign.settle(await client.cosign.approve(request));
      if (resolved.status === 'APPROVED') toast.success(t('cosign.approved', 'Approved'));
      else if (resolved.status === 'PENDING')
        toast.success(t('cosign.approvedPending', 'Approved. It finishes processing in a few seconds.'));
      else
        setError(
          t('cosign.failed', 'It could not be completed. {{reason}}', {
            reason: resolved.failureReason ?? resolved.status.toLowerCase(),
          }),
        );
      await closeIfDone();
    } catch (err) {
      setError(errorText(err, language));
    } finally {
      setBusy(null);
    }
  };

  const reject = async (request: CosignRequest) => {
    setBusy('reject');
    setError(null);
    try {
      await getClient().cosign.reject(request);
      toast.success(t('cosign.rejected', 'Rejected. Nothing was signed.'));
      await closeIfDone();
    } catch (err) {
      setError(errorText(err, language));
    } finally {
      setBusy(null);
    }
  };

  /** What the request is for, in the user's terms. */
  const describe = (request: CosignRequest): { icon: IconType; title: string; body: string } => {
    const details = request.details ?? {};
    if (request.kind === 'ACCOUNT' || request.intent === 'account_create' || request.intent === 'add_accounts')
      return {
        icon: FiSmartphone,
        title: t('cosign.account.title', 'Get your wallet ready'),
        body: t(
          'cosign.account.body',
          'To receive this way, your wallet needs one more setup step. It happens once and moves no funds.',
        ),
      };
    if (request.kind === 'SEP10' || request.kind === 'SEP53' || request.kind === 'MESSAGE' || request.kind === 'AUTH_ENTRY')
      return {
        icon: FiShield,
        title: t('cosign.identity.title', 'Confirm it is you'),
        body: t('cosign.identity.body', 'A signature that proves this wallet is yours. It moves no funds.'),
      };
    const flow = details.flow;
    const flowKind = flow && typeof flow === 'object' && 'kind' in flow && typeof flow.kind === 'string' ? flow.kind : null;
    switch (request.operation) {
      case 'change_trust': {
        const asset = asString(details.assetCode) ?? asString(details.asset) ?? asString(details.symbol) ?? 'USDC';
        return {
          icon: FiCheckCircle,
          title: t('cosign.trust.title', 'Enable {{asset}} in your wallet', { asset }),
          body: t('cosign.trust.body', 'Your wallet accepts {{asset}} once, so it can receive it. It moves no funds.', {
            asset,
          }),
        };
      }
      case 'payment':
      case 'transfer':
        return {
          icon: FiSend,
          title: t('cosign.send.title', 'Confirm this transfer'),
          body: t('cosign.send.body', 'Money leaves your wallet once you approve.'),
        };
      case 'path_payment_strict_send':
        return {
          icon: FiRepeat,
          title: t('cosign.swap.title', 'Confirm this exchange'),
          body: t('cosign.swap.body', 'One asset in your wallet becomes another once you approve.'),
        };
      case 'ramp_payment':
        // A step of a deposit or withdrawal in flight. What it is for depends on
        // where the money goes (`details.flow.kind`); the server's summary is
        // English and technical, so it is never shown.
        if (flowKind === 'bridge')
          return {
            icon: FiSend,
            title: t('cosign.rampBridge.title', 'Finish your deposit'),
            body: t(
              'cosign.rampBridge.body',
              'Your money is already USDC. One approval moves it into your Vaquita wallet. It costs you nothing.',
            ),
          };
        if (flowKind === 'approve')
          return {
            icon: FiCheckCircle,
            title: t('cosign.rampApprove.title', 'Allow your deposit to move'),
            body: t(
              'cosign.rampApprove.body',
              'A permission so your deposit can reach your wallet. It moves no funds by itself.',
            ),
          };
        if (flowKind === 'swap')
          return {
            icon: FiRepeat,
            title: t('cosign.rampSwap.title', 'Convert to USDC'),
            body: t('cosign.rampSwap.body', 'What you received becomes USDC inside your wallet.'),
          };
        if (flowKind === 'payment')
          return {
            icon: FiSend,
            title: t('cosign.rampPayment.title', 'Send to the payment provider'),
            body: t('cosign.rampPayment.body', 'The USDC of your withdrawal goes to the provider, who pays your bank.'),
          };
        return {
          icon: FiSend,
          title: t('cosign.rampStep.title', 'Continue your operation'),
          body: t('cosign.rampStep.body', 'A step of your deposit or withdrawal needs your approval to go on.'),
        };
      case 'cctp_burn':
        return {
          icon: FiRepeat,
          title: t('cosign.moveUsdc.title', 'Move your USDC'),
          body: t('cosign.moveUsdc.body', 'Your USDC moves to another network once you approve.'),
        };
      default:
        return {
          icon: FiFileText,
          title: t('cosign.generic.title', 'Confirm this operation'),
          body: t('cosign.generic.body', 'Your wallet signs it only once you approve from this device.'),
        };
    }
  };

  const described = current ? describe(current) : null;
  const canVote = current !== null && !expired && !deviceNotLinked && busy === null;

  const footer =
    current && described ? (
      deviceNotLinked ? (
        <PressableButton
          variant="primary"
          size="md"
          fullWidth
          onClick={() => {
            onClose();
            openWalletRecovery();
          }}
        >
          {t('cosign.linkDevice', 'Link this device')}
        </PressableButton>
      ) : expired ? (
        <PressableButton variant="white" size="md" fullWidth onClick={onClose}>
          {t('common.close', 'Close')}
        </PressableButton>
      ) : (
        <div className="flex w-full gap-2">
          <PressableButton variant="white" size="md" fullWidth onClick={() => void reject(current)} disabled={!canVote}>
            {busy === 'reject' ? <Spinner size="sm" color="current" /> : t('cosign.reject', 'Reject')}
          </PressableButton>
          <PressableButton
            variant="primary"
            size="md"
            fullWidth
            onClick={() => void approve(current)}
            disabled={!canVote || !verified}
          >
            {busy === 'approve' ? <Spinner size="sm" color="current" /> : t('cosign.approve', 'Approve')}
          </PressableButton>
        </div>
      )
    ) : (
      <PressableButton variant="white" size="md" fullWidth onClick={onClose}>
        {t('common.close', 'Close')}
      </PressableButton>
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onClose}
      title={t('cosign.title', 'Confirm on this device')}
      size="md"
      isDismissable={busy === null}
      hideClose={busy !== null}
      bodyClassName="flex flex-col gap-3"
      footer={footer}
    >
      {current && described ? (
        <>
          <ModalMessage icon={described.icon} title={described.title} body={described.body} className="py-3">
            {pending.length > 1 && (
              <p className="text-xs text-gray-500">
                {t('cosign.oneOf', '{{index}} of {{count}}', { index: 1, count: pending.length })}
              </p>
            )}
          </ModalMessage>

          {deviceNotLinked ? (
            <Notice tone="warn">
              {t(
                'cosign.deviceNotLinked',
                'This device is not part of your wallet yet, so it cannot approve. Add it from a device that is, with your passkey or your email.',
              )}
            </Notice>
          ) : expired ? (
            <Notice tone="warn">{t('cosign.expired', 'This request expired. Start the operation again.')}</Notice>
          ) : verifyFailure ? (
            <Notice tone="warn">
              {t('cosign.notVerified', 'This device could not verify the request, so it will not be approved. {{reason}}', {
                reason: verifyFailure,
              })}
            </Notice>
          ) : verified ? (
            <p className="flex items-center justify-center gap-1.5 text-xs text-[#3F9102]">
              <FiCheckCircle className="h-3.5 w-3.5 shrink-0" />
              {t('cosign.verified', 'Checked on this device. This is exactly what gets signed.')}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <Spinner size="sm" color="current" />
              {t('cosign.verifying', 'Checking on this device…')}
            </p>
          )}

          {!expired && (
            <p className="text-center text-xs text-gray-500">
              {t('cosign.timeLeft', 'You have {{time}} to decide.', { time: timeLeft })}
            </p>
          )}

          {error && <p className="text-center text-xs font-medium text-red-600">{error}</p>}
        </>
      ) : (
        <ModalMessage
          icon={FiCheckCircle}
          title={t('cosign.nothingWaiting', 'Nothing waits for your approval')}
          body={t('cosign.nothingWaitingBody', 'Whatever your wallet had to sign is already done.')}
        />
      )}
    </AppModal>
  );
}
