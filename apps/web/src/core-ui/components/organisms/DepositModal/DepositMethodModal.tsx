'use client';

import { Button, toast } from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiAlertCircle,
  FiCheck,
  FiChevronRight,
  FiCopy,
  FiCreditCard,
  FiDollarSign,
} from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { useProfileData } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';

interface DepositMethodModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** "Ya tengo USDC": cierra este modal y abre el form de depósito (monto + lock). */
  onContinue: () => void;
  /** Onramp ARS: cierra este modal y abre el flujo de recibir fiat. */
  onOnramp: () => void;
}

type Step = 'method' | 'wallet';

/**
 * Paso previo al form de depósito: el usuario elige cómo fondear su cuenta
 * (wallet externa u onramp ARS) o continúa directo si ya tiene USDC. El paso
 * "wallet" muestra la dirección Stellar del usuario para recibir USDC.
 */
export function DepositMethodModal({
  open,
  onOpenChange,
  onContinue,
  onOnramp,
}: DepositMethodModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { data: profile } = useProfileData();
  const [step, setStep] = useState<Step>('method');
  const [copied, setCopied] = useState(false);

  // Cada apertura arranca en la selección de método.
  useEffect(() => {
    if (open) {
      setStep('method');
      setCopied(false);
    }
  }, [open]);

  const accountName =
    profile?.nickname || (walletAddress ? truncateMiddle(walletAddress, 12, 8) : '—');

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success(t('wallet.page.addressCopied'));
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.danger(t('wallet.page.copyError'), {
        description: (e as { message?: string })?.message ?? '',
      });
    }
  };

  const isMethod = step === 'method';

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={
        isMethod
          ? t('deposit.method.title', 'Select method')
          : t('deposit.method.walletDetails.title', 'Wallet details')
      }
      centerTitle
      size="md"
      onBack={isMethod ? undefined : () => setStep('method')}
      bodyClassName="flex flex-col gap-3 pb-2"
      footer={
        isMethod ? (
          <Button
            onPress={onContinue}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
          >
            {t('deposit.method.continue', 'I already have USDC, continue')}
          </Button>
        ) : (
          <Button
            onPress={handleCopy}
            isDisabled={!walletAddress}
            className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black"
          >
            {copied ? <FiCheck className="w-5 h-5" /> : <FiCopy className="w-5 h-5" />}
            {copied
              ? t('wallet.page.copied')
              : t('deposit.method.walletDetails.copy', 'Copy address')}
          </Button>
        )
      }
    >
      {isMethod ? (
        <>
          <button
            type="button"
            onClick={() => setStep('wallet')}
            className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left hover:bg-[#F5FBFF] transition"
          >
            <FiCreditCard className="w-6 h-6 text-black shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-black">
                {t('deposit.method.wallet.title', 'Wallet')}
              </span>
              <span className="block text-xs text-gray-500">
                {t('deposit.method.wallet.subtitle', 'Deposit from a crypto wallet')}
              </span>
            </span>
            <FiChevronRight className="w-5 h-5 text-black shrink-0" />
          </button>
          <button
            type="button"
            onClick={onOnramp}
            className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3 text-left hover:bg-[#F5FBFF] transition"
          >
            <FiDollarSign className="w-6 h-6 text-black shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-black">
                {t('deposit.method.onramp.title', 'Onramp')}
              </span>
              <span className="block text-xs text-gray-500">
                {t('deposit.method.onramp.subtitle', 'Deposit with Argentine pesos (ARS)')}
              </span>
            </span>
            <FiChevronRight className="w-5 h-5 text-black shrink-0" />
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 rounded-md border border-primary bg-[#FFF7E6] px-3 py-2.5">
            <Image src="/icons/global/usdc.png" alt="USDC" width={18} height={18} className="shrink-0" />
            <p className="text-sm font-semibold text-black">
              {t('deposit.method.walletDetails.onlyUsdc', 'Only send USDC on Stellar!')}
            </p>
          </div>

          <div className="rounded-lg border border-black border-b-2 bg-white overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-black truncate">
                  {profile?.nickname ? `@${accountName}` : accountName}
                </p>
                <p className="text-xs text-gray-500">
                  {t('deposit.method.walletDetails.accountLabel', 'Vaquita account')}
                </p>
              </div>
              <Image
                src="/vaquita/vaquita_isotipo.svg"
                alt="Vaquita"
                width={40}
                height={40}
                className="shrink-0"
              />
            </div>
            <div className="border-t border-black/10 p-4">
              <p className="text-xs text-gray-500 mb-1">{t('wallet.page.address')}</p>
              <p className="text-xs font-mono text-black break-all leading-relaxed">
                {walletAddress || '—'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-600">
            <FiAlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              {t(
                'deposit.method.walletDetails.warning',
                'Make sure to send USDC on the Stellar network to this exact address. Funds sent on another network may be lost.',
              )}
            </p>
          </div>
        </>
      )}
    </AppModal>
  );
}
