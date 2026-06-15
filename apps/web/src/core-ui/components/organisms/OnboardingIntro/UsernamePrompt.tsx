'use client';

import { toast } from '@heroui/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiX } from 'react-icons/fi';
import { useRestProfile } from '../../../hooks';
import { Button } from '../../atoms';

interface UsernamePromptProps {
  onDone: () => void;
}

const MIN_LENGTH = 3;

type AvailabilityStatus = 'idle' | 'short' | 'checking' | 'available' | 'taken' | 'error';

export function UsernamePrompt({ onDone }: UsernamePromptProps) {
  const { t } = useTranslation();
  const { saveNickname, checkNicknameAvailability } = useRestProfile();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<AvailabilityStatus>('idle');

  // Para descartar respuestas de checks viejos (race conditions)
  const requestIdRef = useRef(0);

  const trimmed = nickname.trim();

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
        const available = await checkNicknameAvailability(trimmed);
        if (requestId !== requestIdRef.current) return; // respuesta obsoleta
        setStatus(available ? 'available' : 'taken');
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
      const { success, message } = await saveNickname({ nickname: trimmed });
      if (success) {
        toast.success(t('onboarding.username.savedToast', 'Username saved'), { timeout: 3000 });
        onDone();
      } else {
        toast.danger(t('onboarding.username.saveErrorToast', 'Could not save username'), {
          description: message,
          timeout: 4000,
        });
        setStatus('taken');
      }
    } catch (error) {
      toast.danger(t('onboarding.username.saveErrorToast', 'Could not save username'), {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    }
    setSaving(false);
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
    status === 'available' ? 'border-success' : status === 'taken' || status === 'error' ? 'border-error' : 'border-black';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6 py-10">
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
              onChange={(e) => setNickname(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              maxLength={32}
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
              {(status === 'taken' || status === 'error') && (
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-error text-white">
                  <FiX className="w-4 h-4" strokeWidth={3} />
                </span>
              )}
            </div>
          </div>
          <p className={`text-xs pl-2 mt-1 ${helper.className}`}>{helper.text}</p>
        </div>

        <Button type="primary" wFull onPress={handleSubmit} isDisabled={!canSave} isLoading={saving} className="mt-2">
          {t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
