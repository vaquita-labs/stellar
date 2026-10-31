'use client';

import {
  type CosignCustody,
  type CustodyMigrationState,
  isPollarApiError,
  type PollarLanguage,
  transactionErrorMessage,
} from '@pollar/core';
import { usePollar } from '@pollar/react';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogout } from '../../../hooks';
import { openWalletRecovery } from '../../../stores';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { Notice } from '../../molecules/Notice';
import { PressableButton } from '../../molecules/PressableButton';

const CHAIN_NAME: Record<string, string> = { STELLAR: 'Stellar', SOLANA: 'Solana', POLYGON: 'Polygon' };
/** Logos in `public/chains`; a chain without one shows its initial. */
const CHAIN_ICON: Record<string, string> = { STELLAR: '/chains/stellar.png' };
const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const POLLAR_LANGUAGES: PollarLanguage[] = ['en', 'es', 'pt'];

type Wallet = CustodyMigrationState['wallets'][number];

/**
 * Vaquita's own version of Pollar's custody-migration modal.
 *
 * The SDK leaves its built-in one out (`modals.custodyMigration: false` on
 * `PollarProvider`, see `Providers.tsx`) and keeps exposing the state on the
 * context, so the texts and the look are ours: the same `AppModal` as every
 * other sheet, and copy that lives in the locale files like the rest of the
 * app instead of inside `@pollar/react`.
 *
 * What it does is what the SDK's did: a wallet Pollar custodies has to move to
 * this device before it can sign anything, so the sheet cannot be dismissed.
 * The only ways out are moving or logging out, unless something still pending
 * (an open ramp order, a transaction in flight) holds a wallet back; then the
 * user may carry on and the move is asked again next session. After a move
 * Vaquita's recovery screen opens so the user sets up a way to recover the wallet.
 */
export function CustodyMigrationGate() {
  const { t, i18n } = useTranslation();
  const { custodyMigration, refreshCustodyMigration, refreshRecovery, getClient } = usePollar();
  const logout = useLogout();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  // Local to this mount on purpose: a reload asks again, like the SDK did.
  const [later, setLater] = useState(false);
  const [moved, setMoved] = useState(false);
  const [pick, setPick] = useState<CosignCustody | null>(null);
  const [risksAccepted, setRisksAccepted] = useState(false);

  const state = custodyMigration?.required ? custodyMigration : null;
  const open = !!state && !later && !moved;
  // Kept mounted through the exit animation; the recovery screen waits for it
  // (see below) so one sheet does not open on top of another one still leaving.
  const present = useModalPresence(open);

  useEffect(() => {
    if (moved && !present) openWalletRecovery();
  }, [moved, present]);

  if (!state || !present) return null;

  const language = POLLAR_LANGUAGES.find((l) => i18n.language.startsWith(l)) ?? 'en';
  const custody: CosignCustody | null = state.choice ? pick : state.toCustody;
  const canMove = !!custody && (custody !== 'SELF_CUSTODY' || risksAccepted) && !busy;
  const moving = state.wallets.filter((w: Wallet) => w.required);
  const changing = moving.filter((w: Wallet) => w.addressChanges);
  const failed = moving.some((w: Wallet) => w.status === 'FAILED');
  const chainName = (chain: string) => CHAIN_NAME[chain] ?? chain;

  const move = async () => {
    if (!custody) return;
    setBusy(true);
    setError(null);
    setBlockedReasons(null);
    try {
      await getClient().cosign.migrateWallets(state.choice ? custody : undefined);
      refreshCustodyMigration();
      refreshRecovery();
      setMoved(true);
    } catch (err) {
      if (isPollarApiError(err) && err.code === 'SDK_CUSTODY_MIGRATION_BLOCKED') {
        const reasons = err.body.reasons;
        setBlockedReasons(Array.isArray(reasons) ? reasons.map(String) : []);
        return;
      }
      setError(
        transactionErrorMessage(isPollarApiError(err) ? err.code : null, err instanceof Error ? err.message : null, language),
      );
    } finally {
      setBusy(false);
    }
  };

  const continueForNow = () => {
    setLater(true);
    refreshCustodyMigration();
    refreshRecovery();
  };

  const custodyOption = (value: CosignCustody, title: string, body: string) => (
    <label
      className={
        'flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-3 py-2.5 transition ' +
        (pick === value ? 'border-black border-b-2' : 'border-black/20')
      }
    >
      <input
        type="radio"
        name="custody"
        className="mt-1 h-4 w-4 shrink-0 accent-black"
        checked={pick === value}
        onChange={() => setPick(value)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">{title}</span>
        <span className="text-black/70">{body}</span>
      </span>
    </label>
  );

  return (
    <AppModal
      open={open}
      onOpenChange={() => {}}
      isDismissable={false}
      hideClose
      title={t('custodyMigration.title', 'Move your wallets to this device')}
      size="md"
      footer={
        <div className="flex w-full flex-col gap-2">
          <PressableButton variant="primary" size="md" fullWidth onClick={() => void move()} disabled={!canMove}>
            {busy ? (
              <>
                <Spinner size="sm" color="current" />
                {t('custodyMigration.moving', 'Moving your wallets…')}
              </>
            ) : (
              t('custodyMigration.move', 'Move my wallets')
            )}
          </PressableButton>
          {blockedReasons && (
            <PressableButton variant="white" size="md" fullWidth onClick={continueForNow} disabled={busy}>
              {t('custodyMigration.later', 'Continue for now')}
            </PressableButton>
          )}
          <PressableButton variant="ghost" size="md" fullWidth onClick={() => void logout()} disabled={busy}>
            {t('custodyMigration.logout', 'Log out')}
          </PressableButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-black">
        <p className="text-black/70">
          {t(
            'custodyMigration.intro',
            'To better protect your account, your wallets now live on this device and every signature starts here with your keys. They move with everything they hold.',
          )}
        </p>

        <section className="flex flex-col gap-2">
          <h3 className="font-bold">{t('custodyMigration.whatMoves', 'What moves')}</h3>
          <ul className="flex flex-col gap-2">
            {moving.map((w: Wallet) => (
              <li
                key={w.chain}
                className="flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-3 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 bg-white">
                  {CHAIN_ICON[w.chain] ? (
                    <Image src={CHAIN_ICON[w.chain]} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
                  ) : (
                    <span className="text-sm font-bold">{chainName(w.chain).charAt(0)}</span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold leading-tight">{chainName(w.chain)}</span>
                  <span className="truncate text-xs text-gray-500">{shortAddress(w.address)}</span>
                </span>
                <span
                  className={
                    'shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ' +
                    (w.addressChanges ? 'bg-[#FFF7E6] text-[#9A6B00]' : 'bg-success/25 text-[#018222]')
                  }
                >
                  {w.addressChanges
                    ? t('custodyMigration.newAddress', 'New address')
                    : t('custodyMigration.sameAddress', 'Same address')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {changing.length > 0 && (
          <Notice tone="warn">
            {t(
              'custodyMigration.addressChanges',
              'Your {{chains}} address changes. Every token and the balance go to a new address on this device. Stop sharing the old one, because anything sent there later will need help from support to recover.',
              { chains: changing.map((w: Wallet) => chainName(w.chain)).join(t('custodyMigration.and', ' and ')) },
            )}
          </Notice>
        )}

        {state.choice && (
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">{t('custodyMigration.chooseSigning', 'Choose how your wallet signs')}</h3>
            {custodyOption(
              'COSIGNED',
              t('custodyMigration.cosignedTitle', 'Co-signed'),
              t(
                'custodyMigration.cosignedBody',
                'You and the app approve every signature together, and the wallet can be recovered with help.',
              ),
            )}
            {custodyOption(
              'SELF_CUSTODY',
              t('custodyMigration.selfCustodyTitle', 'Self-custody'),
              t('custodyMigration.selfCustodyBody', 'Only your device signs. Nobody else can move or recover your funds.'),
            )}
          </section>
        )}

        {custody === 'SELF_CUSTODY' && (
          <>
            <Notice tone="warn">
              {t(
                'custodyMigration.selfCustodyRisks',
                'In a self-custody wallet only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not even Vaquita or Pollar. A transaction you sign cannot be undone or frozen either.',
              )}
            </Notice>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-black"
                checked={risksAccepted}
                onChange={(e) => setRisksAccepted(e.target.checked)}
              />
              <span>{t('custodyMigration.acceptRisks', 'I understand and accept these risks')}</span>
            </label>
          </>
        )}

        {failed && !error && (
          <p role="alert" className="text-danger">
            {t(
              'custodyMigration.lastAttemptFailed',
              'The last attempt did not finish. What did not move is still where it was, so you can try again.',
            )}
          </p>
        )}

        {blockedReasons && (
          <Notice tone="warn">
            <p>
              {t('custodyMigration.blocked', 'Something still in progress is using your wallet. Let it finish and try again.')}
            </p>
            {blockedReasons.length > 0 && (
              <ul className="list-disc pl-5 text-black/70">
                {blockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}

        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
}
