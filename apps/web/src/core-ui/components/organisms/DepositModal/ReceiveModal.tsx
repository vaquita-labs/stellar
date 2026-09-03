'use client';

import { formatTokenPrecise, MIN_USDC } from '@/core-ui/helpers/numbers';
import { truncateMiddle } from '@/core-ui/helpers/strings';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheck, FiCopy } from 'react-icons/fi';
import QRCode from 'react-qr-code';
import { AppModal } from '../../molecules/AppModal';

interface ReceiveModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Dirección Stellar del usuario a la que recibir USDC (su wallet custodial). */
  address: string;
}

/**
 * Modal nativo (estilo app) para RECIBIR USDC a la propia dirección. Reemplaza al
 * `openReceiveModal` de Pollar, que tiene otro look. Para el usuario social/
 * custodial es su vía de fondeo: comparte su dirección (QR o texto), le entra USDC
 * y de ahí se pone a invertir.
 */
export function ReceiveModal({ open, onOpenChange, address }: ReceiveModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard bloqueado (permisos): el QR sigue disponible; no rompemos nada.
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('deposit.receive.title', 'Deposit')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
    >
      <p className="text-sm text-gray-500 text-center">
        {t(
          'deposit.receive.subtitle',
          'Send USDC on Stellar to this address. It will show up in your balance, ready to invest.',
        )}
      </p>

      {/* Disclaimer de monto mínimo: el piso lo pone MIN_USDC, así que el número
          sale del mismo lugar que lo valida y no de la traducción. */}
      <p className="text-center text-xs font-semibold text-black">
        {t('deposit.receive.minDeposit', 'Minimum deposit: {{amount}} USDC.', { amount: formatTokenPrecise(MIN_USDC, 2) })}
      </p>

      {/* QR de la dirección, en caja blanca redondeada (estilo app). */}
      <div className="mx-auto w-fit rounded-xl border border-black border-b-2 bg-white p-4">
        <QRCode
          value={address || ' '}
          size={168}
          bgColor="#ffffff"
          fgColor="#1a1a1a"
          className="h-[168px] w-[168px]"
        />
      </div>

      {/* Dirección TRUNCADA (no ocupa 4 renglones) + copiar inline. */}
      <div className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-2.5">
        <span className="flex-1 min-w-0">
          <span className="block text-xs text-gray-500">{t('deposit.receive.addressLabel', 'Your address')}</span>
          <span className="block text-sm font-mono text-black truncate">
            {address ? truncateMiddle(address, 8, 8) : '—'}
          </span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!address}
          aria-label={t('deposit.receive.copyAria', 'Copy address')}
          className="flex items-center gap-1.5 shrink-0 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-black text-xs font-semibold transition active:translate-y-0.5 hover:bg-[#c4ecff] disabled:opacity-50"
        >
          {copied ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
          {copied ? t('deposit.receive.copied', 'Copied') : t('deposit.receive.copy', 'Copy')}
        </button>
      </div>

      <div className="flex items-start justify-center gap-1.5 text-xs text-gray-400">
        <FiAlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          {t(
            'deposit.receive.warning',
            'Only send Stellar assets to this address. Funds sent from another network are lost.',
          )}
        </p>
      </div>
    </AppModal>
  );
}
