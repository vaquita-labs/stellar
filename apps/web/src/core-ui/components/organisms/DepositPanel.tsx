'use client';

import { isStellarNetwork } from '@/networks/stellar';
import { directBlendWithdraw, directUsdcTransfer } from '@/networks/stellar/blendDirect';
import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, useIsPoolPaused } from '../../hooks';
import { useMapStore, useConfigStore, useReceiveModalStore } from '../../stores';
import { useModalPresence } from '../molecules/AppModal';
import { CountryPickerModal, DepositMethodModal, DepositModal } from './DepositModal';
import { ReceiveModal } from './DepositModal/ReceiveModal';
import { ReceiveFiatModal } from './FiatModals/ReceiveFiatModal';
import { SendFiatModal } from './FiatModals/SendFiatModal';
import { WithdrawModal } from './WithdrawModal';
import { PressableButton } from '../molecules/PressableButton';

export function DepositPanel() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMethodOpen, setIsMethodOpen] = useState(false);
  // El picker de país lo comparten depósito (on-ramp) y retiro (off-ramp): el
  // flujo activo decide a qué modal se sigue y a cuál vuelve el back.
  const [countryFlow, setCountryFlow] = useState<'deposit' | 'withdraw' | null>(null);
  const [isReceiveFiatOpen, setIsReceiveFiatOpen] = useState(false);
  const isReceiveFiatMounted = useModalPresence(isReceiveFiatOpen);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const isWithdrawMounted = useModalPresence(isWithdrawOpen);
  const [isSendFiatOpen, setIsSendFiatOpen] = useState(false);
  const isSendFiatMounted = useModalPresence(isSendFiatOpen);
  // Modal nativo de recibir (fondeo del usuario social a su dirección custodial).
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const isReceiveMounted = useModalPresence(isReceiveOpen);
  // Publicamos "recibir abierto" al store para que el poll de plata ociosa
  // (`useIdleFunds`, en otro subárbol) sepa cuándo pollear el balance custodial.
  const setReceiveOpenGlobal = useReceiveModalStore((s) => s.setReceiveOpen);
  useEffect(() => {
    setReceiveOpenGlobal(isReceiveOpen);
    return () => setReceiveOpenGlobal(false);
  }, [isReceiveOpen, setReceiveOpenGlobal]);
  const [ isDepositing, setIsDepositing ] = useState(false);
  const { walletAddress, lockPeriod, network, token } = useConfigStore();
  const { wallet: pollarWallet } = usePollar();
  const queryClient = useQueryClient();
  const { trackUserAction } = useAnalytics();
  const editMode = useMapStore((store) => store.editMode);
  const isStellar = network?.networkName ? isStellarNetwork(network.networkName) : false;
  const { isPaused } = useIsPoolPaused();
  const disabled = lockPeriod < 0 || (isStellar && isPaused);

  // Hide Save button when in edit mode
  if (editMode !== null) {
    return null;
  }

  return (
    <div
      style={{ filter: disabled ? 'grayscale(100%)' : 'none' }}
      className="absolute bottom-4 left-0 flex flex-col items-center justify-center w-full gap-1"
    >
      {isStellar && isPaused && (
        <p className="text-sm text-warning font-semibold">
          {t('deposit.panel.paused', 'Deposits are temporarily paused')}
        </p>
      )}
      <div className="w-full max-w-xl px-1 flex gap-1">
        <PressableButton
          variant="white"
          size="cta"
          className="flex-1 h-14 py-0"
          disabled={disabled}
          onClick={() => {
            if (!walletAddress) {
              trackUserAction('withdraw_attempted_no_wallet');
            } else {
              trackUserAction('withdraw_list_opened', {
                token: token?.symbol || null,
                network: network?.networkName || null,
              });
              setIsWithdrawOpen(true);
            }
          }}
        >
          <span className="text-xl text-black capitalize font-normal">{t('deposit.withdraw.button', 'Withdraw')}</span>
        </PressableButton>
        <PressableButton
          variant="success"
          size="cta"
          className="flex-1 h-14 py-0"
          disabled={disabled}
          onClick={() => {
            if (!walletAddress) {
              trackUserAction('deposit_attempted_no_wallet');
            } else {
              trackUserAction('deposit_modal_opened', {
                token: token?.symbol || null,
                lockPeriod,
                network: network?.networkName || null,
              });
              setIsMethodOpen(true);
            }
          }}
        >
          <span className="text-xl text-black capitalize font-medium">
            {isDepositing ? t('deposit.processing', 'Processing...') : t('deposit.panel.deposit', 'Deposit')}
          </span>
        </PressableButton>
      </div>
      <DepositMethodModal
        open={isMethodOpen}
        onOpenChange={() => setIsMethodOpen(false)}
        onContinue={() => {
          setIsMethodOpen(false);
          setIsOpen(true);
        }}
        onOnramp={() => {
          setIsMethodOpen(false);
          setCountryFlow('deposit');
        }}
        onReceive={() => {
          setIsMethodOpen(false);
          setIsReceiveOpen(true);
        }}
      />
      <CountryPickerModal
        open={countryFlow !== null}
        onOpenChange={() => setCountryFlow(null)}
        onBack={() => {
          const flow = countryFlow;
          setCountryFlow(null);
          if (flow === 'withdraw') setIsWithdrawOpen(true);
          else setIsMethodOpen(true);
        }}
        onSelect={(countryCode) => {
          const flow = countryFlow;
          trackUserAction(flow === 'withdraw' ? 'withdraw_offramp_opened' : 'deposit_onramp_opened', {
            country: countryCode,
            network: network?.networkName || null,
          });
          setCountryFlow(null);
          if (flow === 'withdraw') setIsSendFiatOpen(true);
          else setIsReceiveFiatOpen(true);
        }}
      />
      <DepositModal
        open={isOpen}
        onOpenChange={() => setIsOpen(false)}
        isDepositing={isDepositing}
        setIsDepositing={setIsDepositing}
      />
      {isReceiveFiatMounted && (
        <ReceiveFiatModal
          open={isReceiveFiatOpen}
          onOpenChange={() => setIsReceiveFiatOpen(false)}
          onBack={() => {
            setIsReceiveFiatOpen(false);
            setCountryFlow('deposit');
          }}
        />
      )}
      {isWithdrawMounted && (
        <WithdrawModal
          open={isWithdrawOpen}
          onOpenChange={() => setIsWithdrawOpen(false)}
          onOfframp={() => {
            setIsWithdrawOpen(false);
            setCountryFlow('withdraw');
          }}
          onSubmit={async ({ amount, withdrawAll, wallet, onProgress }) => {
            if (!walletAddress || !token) {
              throw new Error(t('withdraw.error.generic', 'Something went wrong'));
            }

            // --- Wallet EXTERNA (Freighter): retiro directo de Blend, el pool
            // paga al firmante (vuelve a su propia wallet). `withdrawAll` saca la
            // posición entera vía el sentinel i128. Un solo salto: 'sending'. ---
            if (pollarWallet?.custody === 'external') {
              onProgress('sending');
              await directBlendWithdraw({
                address: walletAddress,
                amount: String(amount),
                decimals: token.decimals,
                withdrawAll,
              });
              void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
              trackUserAction('withdraw_submitted', {
                amount,
                network: network?.networkName || null,
              });
              return;
            }

            // --- Social/CUSTODIAL: dos saltos con NUESTROS contratos. La plata
            // está en Blend, en la wallet interna; el destino es una wallet
            // EXTERNA elegida. ---
            // 1) Retirar de Blend → wallet custodial (nuestro contrato).
            // 2) Enviar de la custodial → la dirección externa (sendPayment).
            const amountStr = String(amount);

            // Salto 1: Blend → custodial (mismo directBlendWithdraw que externa,
            // pero acá los fondos quedan en la wallet interna del usuario).
            onProgress('preparing');
            await directBlendWithdraw({
              address: walletAddress,
              amount: amountStr,
              decimals: token.decimals,
              withdrawAll,
            });

            // Salto 2: custodial → wallet externa elegida. USDC transfer SOROBAN
            // (no `sendPayment` clásico): esa vía la patrocina Pollar, así que
            // funciona con 0 XLM. El destino debe tener trustline al USDC.
            onProgress('sending');
            await directUsdcTransfer({
              from: walletAddress,
              to: wallet.address,
              amount: amountStr,
              decimals: token.decimals,
            });

            void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
            trackUserAction('withdraw_submitted', {
              amount,
              network: network?.networkName || null,
            });
          }}
        />
      )}
      {isSendFiatMounted && (
        <SendFiatModal open={isSendFiatOpen} onOpenChange={() => setIsSendFiatOpen(false)} />
      )}
      {isReceiveMounted && (
        <ReceiveModal
          open={isReceiveOpen}
          onOpenChange={() => setIsReceiveOpen(false)}
          address={pollarWallet?.address ?? walletAddress ?? ''}
        />
      )}
    </div>
  );
}
