'use client';

import { toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiX } from 'react-icons/fi';
import {
  isWalletRecoveryRequired,
  waitForWalletReady,
  WALLET_READY_WAIT_MS,
  WalletNotReadyError,
} from '@/networks/stellar/walletReady';
import { NICKNAME_MIN_LENGTH, NICKNAME_NEW_MAX_LENGTH, sanitizeNewNickname } from '../../../helpers';
import { useRestProfile } from '../../../hooks';
import { openCosign } from '../../../stores';
import { Button } from '../../atoms';

interface UsernamePromptProps {
  onDone: () => void;
}

const MIN_LENGTH = NICKNAME_MIN_LENGTH;

type AvailabilityStatus = 'idle' | 'short' | 'checking' | 'available' | 'taken' | 'blocked' | 'error';

export function UsernamePrompt({ onDone }: UsernamePromptProps) {
  const { t } = useTranslation();
  const { wallet, getClient, recoveryLocked } = usePollar();
  const { saveNickname, checkNicknameAvailability } = useRestProfile();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<AvailabilityStatus>('idle');
  // A new email login returns before the Stellar account exists. Saving now
  // would sign a challenge the network refuses, and the sheet would report
  // "Authentication required" as if the vaquitag itself had failed.
  const walletPreparing = wallet?.provisioning === 'CREATING';

  // Para descartar respuestas de checks viejos (race conditions)
  const requestIdRef = useRef(0);
  // The name the user already accepted, held while they add the first recovery
  // method. Signing is refused until that exists, and the recovery screen is
  // the next step, so the refusal is not a failed save.
  const heldForRecovery = useRef<string | null>(null);
  const wasRecoveryLocked = useRef(recoveryLocked);
  const saveNicknameRef = useRef(saveNickname);
  const onDoneRef = useRef(onDone);
  saveNicknameRef.current = saveNickname;
  onDoneRef.current = onDone;

  const trimmed = nickname.trim();

  useEffect(() => {
    const unlocked = wasRecoveryLocked.current && !recoveryLocked;
    wasRecoveryLocked.current = recoveryLocked;
    const held = heldForRecovery.current;
    if (!unlocked || !held) return;
    heldForRecovery.current = null;
    let cancelled = false;
    setSaving(true);
    void (async () => {
      try {
        const { success, message } = await saveNicknameRef.current({ nickname: held });
        if (cancelled) return;
        if (success) {
          toast.success(t('onboarding.username.savedToast', 'Username saved'), { timeout: 3000 });
          onDoneRef.current();
          return;
        }
        if (isWalletRecoveryRequired(message)) {
          heldForRecovery.current = held;
          return;
        }
        toast.danger(t('onboarding.username.saveErrorToast', 'Could not save username'), {
          description: message,
          timeout: 4000,
        });
        if (/already in use/i.test(message ?? '')) setStatus('taken');
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recoveryLocked, t]);

  // Debounce de la verificación de disponibilidad contra el backend
  useEffect(() => {
    if (trimmed.length === 0) {
      setStatus('idle');
      return;
    }
    if (trimmed.length < MIN_LENGTH) {
      setStatus('short');
      return;
    }

    setStatus('checking');
    const requestId = ++requestIdRef.current;

    const timeout = setTimeout(async () => {
      try {
        const { available, reason } = await checkNicknameAvailability(trimmed);
        if (requestId !== requestIdRef.current) return; // respuesta obsoleta
        // 'invalid-format' can only happen if something slips past the input
        // sanitizer — surface it as "not allowed" rather than "taken".
        setStatus(available ? 'available' : reason ? 'blocked' : 'taken');
      } catch {
        if (requestId !== requestIdRef.current) return;
        setStatus('error');
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [trimmed, checkNicknameAvailability]);

  const canSave = status === 'available' && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const client = getClient();
      const provisioning = client.getWallet()?.provisioning;
      // The nickname endpoint needs a signature. A co-signed account cannot
      // sign until this device approves its creation, and that request is easy
      // to miss: Pollar only lists it once, at login. Surface it and wait,
      // instead of posting the name with no session.
      if (provisioning === 'CREATING' || provisioning === 'NONE') {
        let pending = await client.cosign.pending().catch(() => []);
        if (pending.length === 0 && provisioning === 'CREATING') {
          await client.createWallet().catch(() => undefined);
          pending = await client.cosign.pending().catch(() => []);
        }
        if (pending.length > 0) openCosign();
        await waitForWalletReady(client, pending.length > 0 ? 180_000 : WALLET_READY_WAIT_MS, {
          refresh: () => client.refreshWalletState(),
        });
      }

      const { success, message } = await saveNickname({ nickname: trimmed });
      if (success) {
        toast.success(t('onboarding.username.savedToast', 'Username saved'), { timeout: 3000 });
        onDone();
      } else if (isWalletRecoveryRequired(message)) {
        heldForRecovery.current = trimmed;
      } else {
        toast.danger(t('onboarding.username.saveErrorToast', 'Could not save username'), {
          description: message,
          timeout: 4000,
        });
        // Only a real collision marks the name taken. An auth or provisioning
        // failure used to land here too, so a brand-new account looked like
        // the vaquitag was unavailable.
        if (/already in use/i.test(message ?? '')) setStatus('taken');
      }
    } catch (error) {
      if (isWalletRecoveryRequired(error)) {
        heldForRecovery.current = trimmed;
        return;
      }
      const preparing = error instanceof WalletNotReadyError;
      toast.danger(t('onboarding.username.saveErrorToast', 'Could not save username'), {
        description: preparing
          ? t(
              'onboarding.username.walletPreparing',
              'Your wallet is still being created. You can pick a vaquitag now; we save it as soon as the account is ready.',
            )
          : ((error as { message?: string })?.message ?? ''),
        timeout: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  const helper = (() => {
    switch (status) {
      case 'short':
        return {
          text: t('onboarding.username.helperShort', 'At least {{count}} characters', {
            count: MIN_LENGTH,
          }),
          className: 'text-black/50',
        };
      case 'checking':
        return {
          text: t('onboarding.username.helperChecking', 'Checking availability…'),
          className: 'text-black/50',
        };
      case 'available':
        return {
          text: t('onboarding.username.helperAvailable', '@{{name}} is available', {
            name: trimmed,
          }),
          className: 'text-success',
        };
      case 'taken':
        return {
          text: t('onboarding.username.helperTaken', '@{{name}} is already taken', {
            name: trimmed,
          }),
          className: 'text-error',
        };
      case 'blocked':
        return {
          text: t('onboarding.username.helperBlocked', 'That username is not allowed'),
          className: 'text-error',
        };
      case 'error':
        return {
          text: t('onboarding.username.helperError', 'Could not check availability, try again'),
          className: 'text-error',
        };
      default:
        return {
          text: t('onboarding.username.helperDefault', 'Shown as @{{name}}', {
            name: trimmed || t('onboarding.username.placeholderName', 'username'),
          }),
          className: 'text-black/50',
        };
    }
  })();

  const borderColor =
    status === 'available'
      ? 'border-success'
      : status === 'taken' || status === 'blocked' || status === 'error'
        ? 'border-error'
        : 'border-black';

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md flex flex-col items-center text-center gap-5">
        <div className="relative w-28 h-28">
          <Image src="/vaquita/vaquita_isotipo.svg" alt="Vaquita" fill sizes="112px" className="object-contain" priority />
        </div>

        <h1 className="text-2xl font-bold text-black">
          {t('onboarding.username.title', 'Choose your username')}
        </h1>
        <p className="text-base text-black/70 max-w-sm">
          {t(
            'onboarding.username.subtitle',
            'This is the name other savers will see. You can change it later in your profile.'
          )}
        </p>

        <div className="w-full text-left mt-2">
          <label className="text-black font-normal text-sm block mb-1">
            {t('onboarding.username.label', 'Username')}
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder={t('onboarding.username.inputPlaceholder', '@username')}
              value={nickname}
              // Only URL-safe lowercase survives typing: a-z and 0-9. Pasting
              // "@juan" leaves "juan"; the API re-validates on save anyway.
              onChange={(e) => setNickname(sanitizeNewNickname(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              maxLength={NICKNAME_NEW_MAX_LENGTH}
              autoFocus
              className={`w-full bg-white border ${borderColor} border-b-2 h-14 pl-3 pr-12 text-black font-medium rounded-sm outline-none transition-colors`}
            />
            {/* Indicador de disponibilidad */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
              {status === 'checking' && (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              )}
              {status === 'available' && (
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-success text-white">
                  <FiCheck className="w-4 h-4" strokeWidth={3} />
                </span>
              )}
              {(status === 'taken' || status === 'blocked' || status === 'error') && (
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-error text-white">
                  <FiX className="w-4 h-4" strokeWidth={3} />
                </span>
              )}
            </div>
          </div>
          <p className={`text-xs pl-2 mt-1 ${helper.className}`}>{helper.text}</p>
          {walletPreparing ? (
            <p className="text-xs pl-2 mt-2 text-black/70">
              {t(
                'onboarding.username.walletPreparing',
                'Your wallet is still being created. You can pick a vaquitag now; we save it as soon as the account is ready.',
              )}
            </p>
          ) : null}
        </div>

        <Button type="primary" wFull onPress={handleSubmit} isDisabled={!canSave} isLoading={saving} className="mt-2">
          {t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
