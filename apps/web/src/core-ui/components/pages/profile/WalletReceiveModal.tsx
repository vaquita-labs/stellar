'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiCheck, FiCopy } from 'react-icons/fi';
import QRCode from 'react-qr-code';
import { AppModal } from '../../molecules/AppModal';

interface WalletReceiveModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Dirección Stellar del usuario a la que recibir cualquier activo. */
  address: string;
}

/**
 * Modal nativo (estilo app) para RECIBIR activos a la propia dirección Stellar.
 * Reemplaza al `openReceiveModal` de Pollar en la pantalla Wallet, que trae otro
 * look y, al vivir fuera del portal HeroUI, no se dejaba cerrar bien. Al ser un
 * `AppModal` (HeroUI) se apila sobre el panel Wallet, recibe clics y bloquea el
 * scroll solo, sin pelear con `inert`.
 */
export function WalletReceiveModal({ open, onOpenChange, address }: WalletReceiveModalProps) {
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
      title={t('wallet.receive.title', 'Receive')}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-6"
    >
      {/* QR de la dirección, en caja blanca redondeada (estilo app). */}
      <div className="mx-auto w-fit rounded-xl border border-black border-b-2 bg-white p-4">
        <QRCode
          value={address || ' '}
          size={180}
          bgColor="#ffffff"
          fgColor="#1a1a1a"
          className="h-[180px] w-[180px]"
        />
      </div>

      <p className="text-sm text-gray-500 text-center">
        {t(
          'wallet.receive.subtitle',
          'Share your Stellar address to receive any asset.',
        )}
      </p>

      {/* Dirección completa + copiar. */}
      <div className="w-full flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-4 py-3">
        <span className="flex-1 min-w-0 text-sm font-mono text-black break-all">
          {address || '—'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!address}
          aria-label={t('wallet.receive.copy', 'Copy')}
          className="flex items-center gap-1.5 shrink-0 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-black text-xs font-semibold transition active:translate-y-0.5 hover:bg-[#c4ecff] disabled:opacity-50"
        >
          {copied ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
          {copied ? t('wallet.receive.copied', 'Copied') : t('wallet.receive.copy', 'Copy')}
        </button>
      </div>

      <div className="flex items-start justify-center gap-1.5 text-xs text-gray-400">
        <FiAlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          {t(
            'wallet.receive.warning',
            'Only send Stellar assets to this address. Funds sent from another network are lost.',
          )}
        </p>
      </div>
    </AppModal>
  );
}
