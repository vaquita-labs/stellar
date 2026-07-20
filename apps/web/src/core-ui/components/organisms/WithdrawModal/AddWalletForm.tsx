'use client';

import { Button, Input, Spinner } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SavedWallet, useCreateSavedWallet } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';

interface AddWalletFormProps {
  onCreated: (wallet: SavedWallet) => void;
}

/**
 * Alta de una dirección de destino. El `network` se toma de la red activa: hoy
 * el retiro solo puede salir por la red en la que está el pool, así que dejar
 * elegirla acá solo habilitaría guardar wallets a las que no se puede enviar.
 */
export function AddWalletForm({ onCreated }: AddWalletFormProps) {
  const { t } = useTranslation();
  const { network } = useConfigStore();
  const createWallet = useCreateSavedWallet();

  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedLabel = label.trim();
  const trimmedAddress = address.trim();
  const canSubmit = trimmedLabel.length > 0 && trimmedAddress.length > 0 && !createWallet.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const wallet = await createWallet.mutateAsync({
        label: trimmedLabel,
        address: trimmedAddress,
        network: network?.networkName ?? '',
      });
      onCreated(wallet);
    } catch (e) {
      setError((e as Error)?.message ?? t('withdraw.addWallet.error', 'Could not save the wallet'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black">
          {t('withdraw.addWallet.labelField', 'Name')}
        </span>
        <Input
          placeholder={t('withdraw.addWallet.labelPlaceholder', 'e.g. My exchange')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          disabled={createWallet.isPending}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black">
          {t('withdraw.addWallet.addressField', 'Address')}
        </span>
        <Input
          placeholder={t('withdraw.addWallet.addressPlaceholder', 'Destination address')}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={128}
          disabled={createWallet.isPending}
          className="font-mono text-xs"
        />
      </label>

      <p className="text-xs text-gray-500">
        {t('withdraw.addWallet.networkHint', 'This address must be on the {{network}} network.', {
          network: network?.networkName ?? '—',
        })}
      </p>

      {error ? <p className="text-sm text-danger font-semibold">{error}</p> : null}

      <Button
        onPress={handleSubmit}
        isDisabled={!canSubmit}
        className="w-full border px-4 py-6 bg-success border-[#018222] border-b-5 font-bold rounded-md text-black disabled:opacity-50"
      >
        {createWallet.isPending ? <Spinner size="sm" color="current" /> : null}
        {t('withdraw.addWallet.save', 'Save wallet')}
      </Button>
    </div>
  );
}
