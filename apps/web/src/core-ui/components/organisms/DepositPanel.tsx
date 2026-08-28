'use client';

import { isBoliviaOfframpEnabled, isBoliviaOnrampEnabled } from '@/core-ui/config/featureFlags';
import type { CorridorCode } from '@/networks/pollar/ramps';
import { isStellarNetwork } from '@/networks/stellar';
import { resolveMemo, sponsoredUsdcPayment } from '@/networks/stellar/blendDirect';
import { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import { PassiveMigrationSheet } from './PassiveMigrationSheet';
import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnalytics, useIsPoolPaused } from '../../hooks';
import { useMapStore, useConfigStore, useAwaitingFundsStore } from '../../stores';
import { useModalPresence } from '../molecules/AppModal';
import { CountryPickerModal, DepositMethodModal, DepositModal } from './DepositModal';
import { ReceiveModal } from './DepositModal/ReceiveModal';
import { ReceiveFiatModal } from './FiatModals/ReceiveFiatModal';
import { ReceiveFiatRampModal } from './FiatModals/ReceiveFiatRampModal';
import { SendFiatModal } from './FiatModals/SendFiatModal';
import { SendFiatRampModal } from './FiatModals/SendFiatRampModal';
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
  // Brasil y Colombia salen por los ramps de Pollar, no por Anclap: mismo modal
  // para los dos, parametrizado por corredor. El corredor va aparte del abierto/
  // cerrado para que no se pierda mientras el modal corre su animación de salida.
  const [rampCountry, setRampCountry] = useState<CorridorCode>('BR');
  const [isRampOpen, setIsRampOpen] = useState(false);
  const isRampMounted = useModalPresence(isRampOpen);
  // Bolivia entra por los ramps de Pollar (compra de USDC pagando un QR), no por
  // Anclap: modal propio, detrás de flag mientras el corredor se termina.
  const [isOnrampOpen, setIsOnrampOpen] = useState(false);
  const isOnrampMounted = useModalPresence(isOnrampOpen);
  const boliviaOnramp = isBoliviaOnrampEnabled();
  const boliviaOfframp = isBoliviaOfframpEnabled();
  // Modal nativo de recibir (fondeo del usuario social a su dirección custodial).
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const isReceiveMounted = useModalPresence(isReceiveOpen);
  // Publicamos que el usuario está esperando plata para que el poll de ociosa
  // (`useIdleFunds`, en otro subárbol) sepa cuándo pollear el balance custodial.
  const setAwaitingFunds = useAwaitingFundsStore((s) => s.setAwaitingFunds);
  useEffect(() => {
    setAwaitingFunds(isReceiveOpen);
    return () => setAwaitingFunds(false);
  }, [isReceiveOpen, setAwaitingFunds]);
  const [isDepositing, setIsDepositing] = useState(false);
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
        <p className="text-sm text-warning font-semibold">{t('deposit.panel.paused', 'Deposits are temporarily paused')}</p>
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
        // El depósito entra por Anclap (ARS) y, con el flag prendido, por el
        // corredor de Pollar de Bolivia (BOB); el retiro suma los corredores de
        // Pollar de Brasil y Colombia, y con su propio flag el de Bolivia.
        available={
          countryFlow === 'withdraw'
            ? boliviaOfframp
              ? ['AR', 'BR', 'CO', 'BO']
              : ['AR', 'BR', 'CO']
            : boliviaOnramp
              ? ['AR', 'BO']
              : ['AR']
        }
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
          if (flow === 'withdraw') {
            // Los corredores de Pollar comparten modal; Argentina sigue por Anclap.
            if (countryCode === 'BR' || countryCode === 'CO' || countryCode === 'BO') {
              setRampCountry(countryCode);
              setIsRampOpen(true);
            } else setIsSendFiatOpen(true);
          } else if (countryCode === 'BO') setIsOnrampOpen(true);
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
              await passiveWithdraw({
                address: walletAddress,
                amount: String(amount),
                decimals: token.decimals,
                withdrawAll,
              });
              void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
              void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
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
            await passiveWithdraw({
              address: walletAddress,
              amount: amountStr,
              decimals: token.decimals,
              withdrawAll,
            });

            // Salto 2: custodial → wallet externa elegida. PAGO CLÁSICO patrocinado
            // por Pollar (`sendPayment`): funciona con 0 XLM Y —a diferencia del
            // transfer SAC de Soroban— es lo que los EXCHANGES detectan y acreditan,
            // con su MEMO (el que cargó el usuario al guardar la wallet; tipo id/text
            // auto-detectado). El destino debe tener trustline al USDC.
            onProgress('sending');
            await sponsoredUsdcPayment({
              to: wallet.address,
              amount: amountStr,
              memo: resolveMemo(wallet.memo) ?? undefined,
            });

            void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
            void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
            trackUserAction('withdraw_submitted', {
              amount,
              network: network?.networkName || null,
            });
          }}
        />
      )}
      {isOnrampMounted && (
        <ReceiveFiatRampModal
          open={isOnrampOpen}
          country="BO"
          onOpenChange={() => setIsOnrampOpen(false)}
          onBack={() => {
            setIsOnrampOpen(false);
            setCountryFlow('deposit');
          }}
        />
      )}
      {isSendFiatMounted && <SendFiatModal open={isSendFiatOpen} onOpenChange={() => setIsSendFiatOpen(false)} />}
      {isRampMounted && (
        <SendFiatRampModal
          open={isRampOpen}
          country={rampCountry}
          onOpenChange={() => setIsRampOpen(false)}
          onBack={() => {
            setIsRampOpen(false);
            setCountryFlow('withdraw');
          }}
        />
      )}
      {isReceiveMounted && (
        <ReceiveModal
          open={isReceiveOpen}
          onOpenChange={() => setIsReceiveOpen(false)}
          address={pollarWallet?.address ?? walletAddress ?? ''}
        />
      )}
      {/* Blocking legacy-Blend migration prompt: self-opens (and self-closes)
          from the live Blend balance when the passive-vault flag is on. Inert
          while dark. */}
      <PassiveMigrationSheet walletAddress={walletAddress} />
    </div>
  );
}
