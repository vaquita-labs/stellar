'use client';

import { usePollar } from '@pollar/react';
import Image from 'next/image';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';

interface WalletBalanceModalProps {
  open: boolean;
  onOpenChange: () => void;
}

/** Formatea el saldo (7 decimales de Stellar) recortando ceros sobrantes. */
function formatUsdc(raw: string | null): string {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

/**
 * Modal nativo (estilo app) para ver el saldo. Reemplaza al `openWalletBalanceModal`
 * de Pollar, que mostraba XLM + trustlines y su propio branding ("Protected by
 * Pollar"). Aquí solo mostramos USDC en Stellar, nada más: es el único activo que
 * le importa al usuario. Los datos salen del mismo `walletBalance` de Pollar.
 */
export function WalletBalanceModal({ open, onOpenChange }: WalletBalanceModalProps) {
  const { t } = useTranslation();
  const { walletBalance, refreshWalletBalance } = usePollar();

  // Refrescamos el saldo cada vez que se abre el modal.
  useEffect(() => {
    if (open) void refreshWalletBalance();
  }, [open, refreshWalletBalance]);

  const loading = walletBalance.step === 'loading' || walletBalance.step === 'idle';
  const usdc =
    walletBalance.step === 'loaded'
      ? walletBalance.data.balances.find((b) => b.code === 'USDC')
      : undefined;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.balanceModal.title', 'Balance')}
      size="sm"
      bodyClassName="flex flex-col gap-4 pb-6"
    >
      <div className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-black border-b-2 bg-gradient-to-b from-[#EAF6FF] to-white px-5 py-8">
        {/* Halo suave detrás del ícono para dar profundidad. */}
        <div className="pointer-events-none absolute -top-10 h-32 w-32 rounded-full bg-[#2775CA]/10 blur-2xl" />

        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-black border-b-2 bg-white">
          <Image src="/icons/global/usdc.png" alt="USDC" width={40} height={40} className="rounded-full" />
        </div>

        <div className="flex flex-col items-center">
          <p className="flex items-baseline gap-1.5 font-mono font-bold text-black">
            <span className="text-4xl tracking-tight">{loading ? '—' : formatUsdc(usdc?.balance ?? '0')}</span>
            <span className="text-base text-gray-400">USDC</span>
          </p>

          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-gray-600">
            <Image src="/chains/stellar.png" alt="Stellar" width={14} height={14} className="rounded-sm" />
            {t('wallet.balanceModal.onStellar', 'on Stellar')}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void refreshWalletBalance()}
        disabled={loading}
        className="mx-auto flex items-center gap-2 rounded-full border border-black border-b-2 bg-white px-5 py-2 text-sm font-semibold text-black transition active:translate-y-0.5 hover:bg-[#F5FBFF] disabled:opacity-50"
      >
        <FiRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        {t('wallet.balanceModal.refresh', 'Refresh')}
      </button>
    </AppModal>
  );
}
