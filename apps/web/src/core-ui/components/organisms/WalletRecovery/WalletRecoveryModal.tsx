'use client';

import { cosignRefusalMessage, isPollarApiError, type PollarLanguage, transactionErrorMessage } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { Spinner, toast } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFileText, FiKey, FiMail, FiSmartphone } from 'react-icons/fi';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { Notice } from '../../molecules/Notice';
import { PressableButton } from '../../molecules/PressableButton';

type View = 'overview' | 'email' | 'export' | 'recover-email';

const POLLAR_LANGUAGES: PollarLanguage[] = ['en', 'es', 'pt'];
const shortKey = (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`;

const INPUT_CLASSES =
  'w-full h-12 px-4 rounded-md bg-white border border-black border-b-2 text-black text-base ' +
  'placeholder:text-gray-400 outline-none focus:border-b-3 transition';

function errorText(err: unknown, language: PollarLanguage): string {
  return (
    cosignRefusalMessage(err, language) ??
    transactionErrorMessage(isPollarApiError(err) ? err.code : null, err instanceof Error ? err.message : null, language)
  );
}

/** One recovery method: icon, name, what it is for, and its rows underneath. */
function MethodCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-black">{icon}</span>
        <div className="flex min-w-0 flex-col">
          <h3 className="text-sm font-bold text-black">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Tag({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'muted' }) {
  const classes = tone === 'ok' ? 'bg-success/25 text-[#018222]' : 'bg-black/5 text-gray-600';
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${classes}`}>{children}</span>;
}

interface WalletRecoveryModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Vaquita's version of the SDK's recovery modal (`modals.recovery: false` on
 * `PollarProvider` leaves the built-in one out). Same job: the ways back into a
 * wallet this device signs for. Add and remove passkeys, confirm an email,
 * approve another device, show the recovery phrase, and, on a device that is
 * not part of the wallet, get back in. Until one method exists the wallet
 * signs nothing but its own setup.
 *
 * Full screen like the other settings screens, with one method per card and
 * the sub-flows (email, phrase, getting back in) as views behind the back arrow.
 */
export function WalletRecoveryModal({ open, onClose }: WalletRecoveryModalProps) {
  // Mounted while visible (through the exit animation) and dropped after, so
  // every opening starts the screen from scratch: fresh read, overview, no
  // phrase left in memory.
  const present = useModalPresence(open);
  if (!present) return null;
  return <RecoveryScreen open={open} onClose={onClose} />;
}

function RecoveryScreen({ open, onClose }: WalletRecoveryModalProps) {
  const { t, i18n } = useTranslation();
  const { getClient, refreshRecovery, appConfig, wallet } = usePollar();
  const language = POLLAR_LANGUAGES.find((l) => i18n.language.startsWith(l)) ?? 'en';

  const walletAddress = wallet?.address ?? '';
  // Read fresh on every opening and never persisted: the methods may have
  // changed from another device, and nothing here belongs in localStorage.
  const query = useQuery({
    queryKey: ['wallet-recovery', walletAddress],
    queryFn: async () => {
      const client = getClient();
      const [state, devices, key] = await Promise.all([
        client.cosign.recovery.status(),
        client.cosign.devices(),
        client.cosign.publicKeyHex(),
      ]);
      // The provider's `recoveryLocked` reads the same state; keep it in step.
      refreshRecovery();
      return { state, devices, thisDeviceKey: key.toLowerCase() };
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  const state = query.data?.state ?? null;
  const devices = query.data?.devices ?? null;
  const thisDeviceKey = query.data?.thisDeviceKey ?? null;

  const [view, setView] = useState<View>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [exportAccepted, setExportAccepted] = useState(false);
  const [risksAccepted, setRisksAccepted] = useState(false);
  const emailValue = emailDraft ?? state?.email.address ?? '';

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(
    () =>
      getClient().onAuthStateChange((authState) => {
        if (authState.step === 'idle') onCloseRef.current();
      }),
    [getClient],
  );

  const goTo = (next: View) => {
    setActionError(null);
    setCodeSent(false);
    setCode('');
    if (next !== 'export') setPhrase(null);
    setView(next);
  };

  /** Run one action with its spinner and error, then read the state again. */
  const run = async (key: string, action: () => Promise<unknown>, after?: { notice?: string; view?: View }) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      await query.refetch();
      if (after?.notice) toast.success(after.notice);
      if (after?.view) goTo(after.view);
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(null);
    }
  };

  const error = actionError ?? query.error;
  const errorMessage = error ? errorText(error, language) : null;

  const recovery = getClient().cosign.recovery;
  const locked = !!state && state.required && !state.configured;
  const enrolled = !!thisDeviceKey && !!devices?.devices.some((d) => d.publicKey.toLowerCase() === thisDeviceKey);
  const selfCustodyRisks = appConfig.application?.walletCustodyMode === 'SELF_CUSTODY' && devices?.custody === 'SELF_CUSTODY';
  const risksPending = locked && selfCustodyRisks && !risksAccepted;
  const lastMethod =
    !!state && state.passkeys.length + (state.email.verified ? 1 : 0) + (state.devices.length >= 2 ? 1 : 0) <= 1;
  const emailAddress = state?.email.address ?? t('walletRecovery.yourEmail', 'your email');

  const actionButton = (
    id: string,
    label: string,
    onClick: () => void,
    options: { variant?: 'primary' | 'white' | 'ghost' | 'danger'; disabled?: boolean } = {},
  ) => (
    <PressableButton
      variant={options.variant ?? 'white'}
      size="md"
      fullWidth
      onClick={onClick}
      disabled={options.disabled || busy !== null}
    >
      {busy === id ? (
        <>
          <Spinner size="sm" color="current" />
          {t('walletRecovery.working', 'One moment…')}
        </>
      ) : (
        label
      )}
    </PressableButton>
  );

  const codeForm = (id: string, label: string, onSubmit: (code: string) => void) => (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onSubmit(code);
      }}
    >
      <input
        className={INPUT_CLASSES}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('walletRecovery.codePlaceholder', 'Code from the email')}
        autoComplete="one-time-code"
        inputMode="numeric"
        aria-label={t('walletRecovery.codePlaceholder', 'Code from the email')}
      />
      {actionButton(id, label, () => code.trim() && onSubmit(code), { variant: 'primary', disabled: !code.trim() })}
    </form>
  );

  let title = t('walletRecovery.title', 'Protect your wallet');
  let body: ReactNode;

  if (!state) {
    body = (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
        <Spinner size="sm" color="current" />
        {t('walletRecovery.loading', 'Loading your recovery methods…')}
      </div>
    );
  } else if (!state.required) {
    body = (
      <p className="text-sm text-gray-500">
        {t('walletRecovery.notRequired', 'This wallet is not secured by your device, so it needs no recovery methods.')}
      </p>
    );
  } else if (!enrolled && view !== 'recover-email') {
    title = t('walletRecovery.getBackIn', 'Get back into your wallet');
    body = (
      <>
        <Notice tone="warn">
          {t(
            'walletRecovery.notEnrolled',
            'This device is not part of your wallet yet. Get back in with one of your recovery methods, or ask a device that already has the wallet to add this one.',
          )}
        </Notice>
        {state.passkeys.length > 0 &&
          recovery.passkeyAvailable &&
          actionButton(
            'recover-passkey',
            t('walletRecovery.usePasskey', 'Use a passkey'),
            () =>
              void run('recover-passkey', () => recovery.recoverWithPasskey(), {
                notice: t('walletRecovery.recovered', 'This device is part of your wallet again.'),
              }),
            { variant: 'primary' },
          )}
        {state.email.verified &&
          actionButton(
            'recover-send',
            t('walletRecovery.emailCodeTo', 'Email a code to {{address}}', { address: emailAddress }),
            () => goTo('recover-email'),
          )}
        {actionButton(
          'enroll',
          t('walletRecovery.askAnotherDevice', 'Ask another device to add this one'),
          () =>
            void run('enroll', () => recovery.requestDeviceEnrollment(), {
              notice: t(
                'walletRecovery.requestSent',
                'Request sent. Approve it from a device that already has this wallet within 15 minutes.',
              ),
            }),
        )}
      </>
    );
  } else if (risksPending && view === 'overview') {
    body = (
      <>
        <Notice tone="warn">
          {t(
            'walletRecovery.selfCustodyWarning',
            'This is a self-custody wallet, so only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not even Vaquita or Pollar. A transaction you sign cannot be undone or frozen either.',
          )}
        </Notice>
        {actionButton(
          'accept-risks',
          t('walletRecovery.acceptRisks', 'I understand and accept these risks'),
          () => setRisksAccepted(true),
          {
            variant: 'primary',
          },
        )}
      </>
    );
  } else if (view === 'recover-email') {
    title = t('walletRecovery.getBackIn', 'Get back into your wallet');
    body = (
      <>
        <p className="text-sm text-gray-600">
          {t(
            'walletRecovery.recoverEmailIntro',
            'We will email a code to {{address}}. The code goes straight to the wallet provider, encrypted on this device.',
            { address: emailAddress },
          )}
        </p>
        {!codeSent
          ? actionButton(
              'recover-send',
              t('walletRecovery.sendCode', 'Send code'),
              () =>
                void run('recover-send', async () => {
                  await recovery.startEmailRecovery();
                  setCodeSent(true);
                }),
              { variant: 'primary' },
            )
          : codeForm(
              'recover-code',
              t('walletRecovery.recover', 'Recover'),
              (value) =>
                void run('recover-code', () => recovery.recoverWithEmailCode(value.trim()), {
                  notice: t('walletRecovery.recovered', 'This device is part of your wallet again.'),
                  view: 'overview',
                }),
            )}
      </>
    );
  } else if (view === 'email') {
    title = t('walletRecovery.confirmEmail', 'Confirm an email');
    body = (
      <>
        <p className="text-sm text-gray-600">
          {t(
            'walletRecovery.emailIntro',
            'Confirm an email you control. If you lose this device, a code sent there lets you add a new one. Anyone who controls this inbox could do the same, so use one that is well protected.',
          )}
        </p>
        {!codeSent ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (emailValue.trim())
                void run('email-send', async () => {
                  await recovery.startEmail(emailValue.trim());
                  setCodeSent(true);
                });
            }}
          >
            <input
              className={INPUT_CLASSES}
              type="email"
              value={emailValue}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder={t('walletRecovery.emailPlaceholder', 'you@example.com')}
              autoComplete="email"
              aria-label={t('walletRecovery.email', 'Email')}
            />
            {actionButton(
              'email-send',
              t('walletRecovery.sendCode', 'Send code'),
              () =>
                void run('email-send', async () => {
                  await recovery.startEmail(emailValue.trim());
                  setCodeSent(true);
                }),
              { variant: 'primary', disabled: !emailValue.trim() },
            )}
          </form>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              {t('walletRecovery.codeSentTo', 'We sent a code to {{address}}.', { address: emailValue.trim() })}
            </p>
            {codeForm(
              'email-confirm',
              t('walletRecovery.confirm', 'Confirm'),
              (value) =>
                void run('email-confirm', () => recovery.confirmEmail(value.trim()), {
                  notice: t('walletRecovery.emailConfirmed', 'Email confirmed.'),
                  view: 'overview',
                }),
            )}
          </>
        )}
      </>
    );
  } else if (view === 'export') {
    title = t('walletRecovery.recoveryPhrase', 'Recovery phrase');
    body = phrase ? (
      <>
        <Notice tone="warn">
          {t(
            'walletRecovery.phraseWarning',
            'Anyone with these words controls every account in this wallet. Write them down offline and never share them.',
          )}
        </Notice>
        <p className="select-all rounded-lg border border-black border-b-2 bg-white px-4 py-4 text-base leading-8 text-black break-words">
          {phrase}
        </p>
        {actionButton('hide', t('walletRecovery.hide', 'Hide'), () => goTo('overview'), { variant: 'primary' })}
      </>
    ) : (
      <>
        <p className="text-sm text-gray-600">
          {t(
            'walletRecovery.exportIntro',
            'Your recovery phrase lets you take this wallet to another app. It is decrypted only on this device, so neither Vaquita nor Pollar ever see it.',
          )}
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-black">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-black"
            checked={exportAccepted}
            onChange={(e) => setExportAccepted(e.target.checked)}
          />
          <span>{t('walletRecovery.exportAccept', 'I understand that whoever sees the phrase controls the wallet')}</span>
        </label>
        {actionButton(
          'export',
          t('walletRecovery.showPhrase', 'Show recovery phrase'),
          () =>
            void run('export', async () => {
              setPhrase(await recovery.exportWallet());
            }),
          { variant: 'danger', disabled: !exportAccepted },
        )}
      </>
    );
  } else {
    const enrollments = devices?.enrollments ?? [];
    body = (
      <>
        {locked ? (
          <Notice tone="warn">
            {t(
              'walletRecovery.locked',
              'Your wallet has no way to be recovered yet. Add a passkey, your email or a second device, so losing this device never means losing your funds.',
            )}
          </Notice>
        ) : (
          <Notice tone="ok">{t('walletRecovery.recoverable', 'Your wallet can be recovered if you lose this device.')}</Notice>
        )}

        <MethodCard
          icon={<FiKey className="h-4 w-4" />}
          title={t('walletRecovery.passkeys', 'Passkeys')}
          subtitle={t('walletRecovery.passkeysHelp', 'Face ID, fingerprint or the lock of your device.')}
        >
          {state.passkeys.map((pk) => (
            <div key={pk.authenticatorId} className="flex items-center justify-between gap-3 text-sm text-black">
              <span className="truncate">{pk.name}</span>
              <PressableButton
                variant="ghost"
                size="chip"
                onClick={() => void run(`passkey:${pk.authenticatorId}`, () => recovery.removePasskey(pk.authenticatorId))}
                disabled={lastMethod || busy !== null}
              >
                {busy === `passkey:${pk.authenticatorId}` ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  t('walletRecovery.remove', 'Remove')
                )}
              </PressableButton>
            </div>
          ))}
          {recovery.passkeyAvailable ? (
            actionButton(
              'passkey',
              t('walletRecovery.addPasskey', 'Add a passkey'),
              () =>
                void run('passkey', () => recovery.addPasskey(), {
                  notice: t('walletRecovery.passkeyAdded', 'Passkey added.'),
                }),
              { variant: state.passkeys.length === 0 && locked ? 'primary' : 'white' },
            )
          ) : (
            <p className="text-xs text-gray-500">
              {t('walletRecovery.passkeysUnavailableDevice', 'Passkeys are not available on this device.')}
            </p>
          )}
        </MethodCard>

        <MethodCard
          icon={<FiMail className="h-4 w-4" />}
          title={t('walletRecovery.email', 'Email')}
          subtitle={t('walletRecovery.emailHelp', 'A code sent there lets you add a new device.')}
        >
          {state.email.verified ? (
            <div className="flex items-center justify-between gap-3 text-sm text-black">
              <span className="truncate">{state.email.address}</span>
              <Tag>{t('walletRecovery.confirmed', 'Confirmed')}</Tag>
            </div>
          ) : (
            actionButton('email', t('walletRecovery.confirmEmail', 'Confirm an email'), () => goTo('email'))
          )}
        </MethodCard>

        <MethodCard
          icon={<FiSmartphone className="h-4 w-4" />}
          title={t('walletRecovery.devices', 'Devices')}
          subtitle={t('walletRecovery.devicesHelp', 'Every device that can sign with this wallet.')}
        >
          {(devices?.devices ?? []).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 text-sm text-black">
              <span className="truncate">{d.label ?? shortKey(d.publicKey)}</span>
              {d.publicKey.toLowerCase() === thisDeviceKey && (
                <Tag tone="muted">{t('walletRecovery.thisDevice', 'This device')}</Tag>
              )}
            </div>
          ))}
          {enrollments.map((e) => (
            <div
              key={e.id}
              className="flex flex-col gap-2 rounded-lg border border-[#F0B429] bg-[#FFF7E6] px-3 py-2.5 text-sm text-black"
            >
              <span>
                {t('walletRecovery.wantsToJoin', '{{label}} wants to join this wallet', {
                  label: e.label ?? t('walletRecovery.aDevice', 'A device'),
                })}
                <span className="ml-1 text-xs text-gray-500">{shortKey(e.publicKey)}</span>
              </span>
              <div className="flex gap-2">
                <PressableButton
                  variant="primary"
                  size="chip"
                  onClick={() =>
                    void run(`approve:${e.id}`, () => recovery.approveDevice(e.id), {
                      notice: t('walletRecovery.deviceAdded', 'Device added.'),
                    })
                  }
                  disabled={busy !== null}
                >
                  {t('walletRecovery.approve', 'Approve')}
                </PressableButton>
                <PressableButton
                  variant="ghost"
                  size="chip"
                  onClick={() => void run(`reject:${e.id}`, () => recovery.rejectDevice(e.id))}
                  disabled={busy !== null}
                >
                  {t('walletRecovery.reject', 'Reject')}
                </PressableButton>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-500">
            {t(
              'walletRecovery.addDeviceHelp',
              'To add another device, sign in there and choose "Ask another device to add this one". It will show up here for you to approve. Only approve a device you are holding.',
            )}
          </p>
        </MethodCard>

        <MethodCard
          icon={<FiFileText className="h-4 w-4" />}
          title={t('walletRecovery.recoveryPhrase', 'Recovery phrase')}
          subtitle={t('walletRecovery.phraseHelp', 'Take this wallet to another app.')}
        >
          {actionButton('export-view', t('walletRecovery.exportPhrase', 'Show recovery phrase'), () => goTo('export'))}
        </MethodCard>
      </>
    );
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onClose}
      title={title}
      size="lg"
      fullScreen
      onBack={view !== 'overview' ? () => goTo('overview') : undefined}
      bodyClassName="flex-1"
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        {body}
        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
      </div>
    </AppModal>
  );
}
