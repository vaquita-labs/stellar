'use client';

import { isStellarNetwork } from '@/networks/stellar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, useIsPoolPaused } from '../../hooks';
import { useMapStore, useConfigStore } from '../../stores';
import { useModalPresence } from '../molecules/AppModal';
import { CountryPickerModal, DepositMethodModal, DepositModal } from './DepositModal';
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
  const [ isDepositing, setIsDepositing ] = useState(false);
  const { walletAddress, lockPeriod, network, token } = useConfigStore();
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
          className="flex-1 h-12 py-0"
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
          <span className="text-xl text-black capitalize font-medium">{t('deposit.withdraw.button', 'Withdraw')}</span>
        </PressableButton>
        <PressableButton
          variant="success"
          size="cta"
          className="flex-1 h-12 py-0"
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
          onSubmit={async ({ amount, wallet }) => {
            // TODO(withdraw): PLACEHOLDER — no mueve fondos.
            //
            // El retiro real todavía no existe para este flujo. El contrato
            // (contracts/vaquita-pool/src/lib.rs:168) expone
            // `withdraw(caller, deposit_id)`: retira la posición ENTERA y paga
            // siempre a quien firma, así que no admite ni el monto parcial que
            // se teclea acá ni la dirección de destino elegida. La API
            // (apps/api/src/routes/deposit/route.ts:142) tampoco lee `amount`.
            //
            // Este stub solo simula la demora para poder ver los estados de
            // loading y éxito. Reemplazar por la mutación real cuando se defina
            // de dónde salen los fondos.
            console.warn('[withdraw] placeholder submit', { amount, wallet });
            trackUserAction('withdraw_submitted', {
              amount,
              network: network?.networkName || null,
            });
            await new Promise((resolve) => setTimeout(resolve, 1800));
          }}
        />
      )}
      {isSendFiatMounted && (
        <SendFiatModal open={isSendFiatOpen} onOpenChange={() => setIsSendFiatOpen(false)} />
      )}
    </div>
  );
}
