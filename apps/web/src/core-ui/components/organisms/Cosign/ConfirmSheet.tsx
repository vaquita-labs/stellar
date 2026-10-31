'use client';

import type { PendingConfirmation } from '@pollar/core';
import { usePollar } from '@pollar/react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiAward, FiCheckCircle, FiFileText, FiPocket, FiRepeat, FiSend, FiShield, FiTrendingUp } from 'react-icons/fi';
import { useConfigStore } from '../../../stores';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { ModalMessage } from '../../molecules/ModalMessage';
import { PressableButton } from '../../molecules/PressableButton';

const asString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Vaquita's version of the SDK's confirmation prompt. The app's signing
 * policy at Pollar asks the user to confirm each transaction before the wallet
 * signs it; the SDK parks the request in `usePollar().confirmations` with a
 * `confirm` and a `reject`, and showed its own prompt, which is hidden now
 * (see globals.css). This sheet says what is about to be signed in the user's
 * words, from the contract call the app itself built, and answers the request.
 * Closing it is a no.
 */
export function ConfirmSheet({ confirmation }: { confirmation: PendingConfirmation | null }) {
  const present = useModalPresence(confirmation !== null);
  if (!present) return null;
  return <ConfirmScreen confirmation={confirmation} />;
}

function ConfirmScreen({ confirmation }: { confirmation: PendingConfirmation | null }) {
  const { t } = useTranslation();
  const { token } = useConfigStore();
  const { wallet } = usePollar();
  const custodied = wallet?.custody !== 'external';

  const describe = (c: PendingConfirmation): { icon: IconType; title: string; body: string } => {
    const details = c.details ?? {};
    const method = asString(details.method);
    const contractId = asString(details.contractId);
    if (c.operation === 'invoke_contract' && method) {
      const flexible = !!token?.defindexVaultContractAddress && contractId === token.defindexVaultContractAddress;
      const locked = !!token?.vaquitaContractAddress && contractId === token.vaquitaContractAddress;
      if (method === 'deposit' && (flexible || locked))
        return {
          icon: flexible ? FiTrendingUp : FiPocket,
          title: flexible
            ? t('confirmTx.flexibleDeposit.title', 'Put your money to work')
            : t('confirmTx.lockedDeposit.title', 'Save for a term'),
          body: flexible
            ? t(
                'confirmTx.flexibleDeposit.body',
                'Your USDC goes into your flexible savings and starts earning. You can take it out any time.',
              )
            : t('confirmTx.lockedDeposit.body', 'Your USDC goes into a term with its agreed rate until it matures.'),
        };
      if (method === 'withdraw' && (flexible || locked))
        return {
          icon: FiPocket,
          title: t('confirmTx.withdraw.title', 'Take money out of your savings'),
          body: t('confirmTx.withdraw.body', 'Your USDC comes back to your wallet.'),
        };
      if (method === 'mint_badge')
        return {
          icon: FiAward,
          title: t('confirmTx.badge.title', 'Claim your badge'),
          body: t('confirmTx.badge.body', 'The badge is written to your wallet. It moves no money.'),
        };
    }
    switch (c.operation) {
      case 'payment':
      case 'transfer':
        return {
          icon: FiSend,
          title: t('confirmTx.send.title', 'Send money'),
          body: t('confirmTx.send.body', 'The amount leaves your wallet once you confirm.'),
        };
      case 'change_trust':
        return {
          icon: FiCheckCircle,
          title: t('confirmTx.trust.title', 'Enable an asset in your wallet'),
          body: t('confirmTx.trust.body', 'Your wallet accepts it once, so it can receive it. It moves no funds.'),
        };
      case 'path_payment_strict_send':
        return {
          icon: FiRepeat,
          title: t('confirmTx.swap.title', 'Exchange'),
          body: t('confirmTx.swap.body', 'One asset in your wallet becomes another once you confirm.'),
        };
      default:
        if (c.kind === 'sign_auth_entry')
          return {
            icon: FiShield,
            title: t('confirmTx.auth.title', 'Authorize this operation'),
            body: t('confirmTx.auth.body', 'A permission your wallet gives for one operation.'),
          };
        return {
          icon: FiFileText,
          title: t('confirmTx.generic.title', 'Confirm this operation'),
          body: t('confirmTx.generic.body', 'Your wallet signs it only once you confirm.'),
        };
    }
  };

  const described = confirmation ? describe(confirmation) : null;

  return (
    <AppModal
      open={confirmation !== null}
      onOpenChange={() => confirmation?.reject()}
      title={t('confirmTx.title', 'Confirm')}
      size="md"
      footer={
        confirmation ? (
          <div className="flex w-full gap-2">
            <PressableButton variant="white" size="md" fullWidth onClick={() => confirmation.reject()}>
              {t('confirmTx.reject', 'Not now')}
            </PressableButton>
            <PressableButton variant="success" size="md" fullWidth onClick={() => confirmation.confirm()}>
              {t('confirmTx.confirm', 'Confirm')}
            </PressableButton>
          </div>
        ) : null
      }
    >
      {described && (
        <ModalMessage icon={described.icon} title={described.title} body={described.body} className="py-3">
          <p className="text-xs text-gray-500">
            {custodied
              ? t('confirmTx.signedHere', 'Signed from this device. Nothing is sent until you confirm.')
              : t('confirmTx.signedInWallet', 'Your wallet will ask you to sign next.')}
          </p>
        </ModalMessage>
      )}
    </AppModal>
  );
}
