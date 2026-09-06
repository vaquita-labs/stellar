'use client';

import { useRampCountries } from '@/networks/pollar/rampCountries';
import type { CorridorCode } from '@/networks/pollar/ramps';
import { isStellarNetwork } from '@/networks/stellar';
import { awaitUsdcCredit, readUsdcBalance, resolveMemo, sponsoredUsdcPayment } from '@/networks/stellar/blendDirect';
import { formatBaseUnits } from '@/networks/stellar/vaultQueries';
import { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import { WithdrawPaymentError } from '@/networks/stellar/withdrawError';
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
  // Anclap: modal propio.
  const [isOnrampOpen, setIsOnrampOpen] = useState(false);
  const isOnrampMounted = useModalPresence(isOnrampOpen);
  // Quién habilita Bolivia es el proveedor, no un flag de build. La lista se pide
  // recién cuando el usuario abre alguna puerta de fiat —no en cada home— y se
  // arranca desde el modal de método/retiro, un paso antes del picker, para que
  // llegue a tiempo y el país no aparezca apagado un instante.
  const { supports: rampSupports } = useRampCountries(isMethodOpen || isWithdrawOpen || countryFlow !== null);
  const bolivia = rampSupports('BO');
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
        // El depósito entra por Anclap (ARS) y, si el proveedor lo tiene
        // habilitado, por el corredor de Pollar de Bolivia (BOB); el retiro suma
        // los de Brasil y Colombia.
        //
        // Argentina no se consulta porque no es de Pollar —es Anclap— y Brasil y
        // Colombia tampoco: la lista no trae dirección, así que un país que sólo
        // figure para compra apagaría un retiro que hoy funciona. Bolivia sí,
        // que es la que se está habilitando.
        available={
          countryFlow === 'withdraw'
            ? bolivia
              ? ['AR', 'BR', 'CO', 'BO']
              : ['AR', 'BR', 'CO']
            : bolivia
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

            const amountStr = String(amount);
            // El pool SIEMPRE le paga al firmante, así que lo que decide cuántos
            // saltos hay es a dónde va la plata, no con qué wallet entró: a la
            // propia alcanza con sacarla de Blend; a la de otro hay que sacarla
            // y después pagarle desde la del usuario. Una wallet externa
            // mandándole a un usuario de Vaquita hace los mismos dos saltos que
            // la social — la diferencia es que firma cada uno en su extensión.
            //
            // Se comparan las DOS direcciones propias: el modal arma su destino
            // "tu wallet" con la de Pollar y el salto 1 acredita en la del store.
            // Son la misma cuenta, pero si alguna vez difieren esto tiene que
            // seguir leyéndose como "a mí" — pagarse a uno mismo sería un salto
            // de más, con su firma y su fee.
            const toSelf = wallet.address === walletAddress || wallet.address === pollarWallet?.address;

            // Con un salto 2 por delante hay que medir cuánto llegó de verdad:
            // `withdrawAll` saca la posición ENTERA (sentinel i128), que con los
            // intereses del último bloque no es exactamente el monto tecleado.
            // Pagar el tecleado dejaría polvo, o rebotaría por saldo si llegó de
            // menos. Se lee antes de mover nada para poder restar después.
            const balanceBefore = toSelf ? 0 : await readUsdcBalance(walletAddress, token.decimals);

            // Salto 1 (o único): Blend → la wallet del usuario. `withdrawAll`
            // saca la posición entera vía el sentinel i128.
            onProgress(toSelf ? 'sending' : 'preparing');
            const { hash } = await passiveWithdraw({
              address: walletAddress,
              amount: amountStr,
              decimals: token.decimals,
              withdrawAll,
            });

            // A partir de acá la plata YA salió de Blend y está en la wallet del
            // usuario. Nada de lo que siga puede deshacer eso, así que la
            // posición se refresca ahora: si el salto 2 falla, las pantallas
            // tienen que mostrar el estado real, no el de antes del retiro.
            void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
            void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });

            if (toSelf) {
              trackUserAction('withdraw_submitted', {
                amount,
                network: network?.networkName || null,
              });
              return;
            }

            // Salto 2: wallet del usuario → destino. PAGO CLÁSICO vía Pollar
            // (`sendPayment`): a diferencia del transfer SAC de Soroban es lo que
            // los EXCHANGES detectan y acreditan, con su MEMO (el que cargó el
            // usuario al guardar la wallet; tipo id/text auto-detectado). El
            // destino debe tener trustline al USDC — el modal lo verifica antes
            // de dejar firmar el salto 1, justamente para no llegar acá y rebotar
            // con la plata ya afuera.
            //
            // Se espera el crédito antes de armar el pago: el salto 1 confirma en
            // el ledger, pero el RPC puede ir atrás y el pago saldría contra un
            // saldo que todavía no ve.
            const creditedBase = await awaitUsdcCredit(walletAddress, token.decimals, balanceBefore, { hash });
            // Retiro total: se manda lo que EFECTIVAMENTE llegó. Monto puntual:
            // lo pedido, que es lo que el usuario aprobó en la confirmación.
            const toSend = withdrawAll ? formatBaseUnits(creditedBase, token.decimals) : amountStr;

            try {
              onProgress('sending');
              await sponsoredUsdcPayment({
                to: wallet.address,
                amount: toSend,
                memo: resolveMemo(wallet.memo) ?? undefined,
              });
            } catch (e) {
              // El salto 1 ya movió la plata: decir "el retiro falló" a secas
              // haría pensar que sigue invertida. `WithdrawPaymentError` dice
              // dónde quedó y cómo seguir — Wallet → Enviar hace exactamente este
              // pago, así que se reintenta desde ahí sin volver a tocar Blend.
              throw new WithdrawPaymentError(wallet.label, e);
            }

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
      {isSendFiatMounted && (
        <SendFiatModal
          open={isSendFiatOpen}
          onOpenChange={() => setIsSendFiatOpen(false)}
          onBack={() => {
            setIsSendFiatOpen(false);
            setCountryFlow('withdraw');
          }}
        />
      )}
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
