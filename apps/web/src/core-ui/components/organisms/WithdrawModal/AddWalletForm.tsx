'use client';

import { Button, Spinner, toast } from '@heroui/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiClipboard } from 'react-icons/fi';
import { SavedWallet, useCreateSavedWallet } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';

interface AddWalletFormProps {
  onCreated: (wallet: SavedWallet) => void;
}

/**
 * El backend valida contra los slugs canónicos de red (`stellar-testnet`,
 * `stellar`, …), pero el config store expone el nombre para mostrar
 * ("Stellar Testnet"). Se normaliza a slug antes de enviar.
 */
const toNetworkSlug = (networkName: string) => networkName.trim().toLowerCase().replace(/\s+/g, '-');

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
  const addressInputRef = useRef<HTMLInputElement>(null);

  const trimmedLabel = label.trim();
  const trimmedAddress = address.trim();
  const canSubmit = trimmedLabel.length > 0 && trimmedAddress.length > 0 && !createWallet.isPending;

  // La lectura programática del portapapeles (`clipboard.readText`) NO es
  // universal: falla en contextos no seguros (http por IP en LAN, típico al
  // probar desde el celular), en Firefox y en varios navegadores in-app. Se
  // intenta solo cuando hay API y contexto seguro; si no, se enfoca el input
  // para que el usuario pegue a mano (long-press en mobile, Ctrl/Cmd+V en
  // desktop) — nunca un error, porque el pegado manual siempre funciona.
  const handlePaste = async () => {
    const canRead =
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.readText === 'function' &&
      window.isSecureContext;

    if (canRead) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          setAddress(text.trim());
          if (error) setError(null);
        }
        return;
      } catch {
        // Permiso denegado o gesto insuficiente: cae al pegado manual.
      }
    }

    addressInputRef.current?.focus();
    toast(t('withdraw.addWallet.pasteManual', 'Paste the address into the field'));
  };

  // Mismo estilo que el buscador del CountryPickerModal, para que todos los
  // inputs del flujo compartan el borde negro con base gruesa del design system.
  const inputClasses =
    'w-full rounded-md border border-black border-b-2 bg-white h-12 px-3 text-black ' +
    'placeholder:text-gray-400 outline-none focus:border-b-3 disabled:opacity-50';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const wallet = await createWallet.mutateAsync({
        label: trimmedLabel,
        address: trimmedAddress,
        network: toNetworkSlug(network?.networkName ?? ''),
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
        <input
          type="text"
          placeholder={t('withdraw.addWallet.labelPlaceholder', 'e.g. My exchange')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          disabled={createWallet.isPending}
          className={inputClasses}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black">
          {t('withdraw.addWallet.addressField', 'Address')}
        </span>
        <div className="relative">
          <input
            ref={addressInputRef}
            type="text"
            placeholder={t('withdraw.addWallet.addressPlaceholder', 'Destination address')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={128}
            disabled={createWallet.isPending}
            className={inputClasses + ' font-mono text-xs pr-11'}
          />
          <button
            type="button"
            onClick={handlePaste}
            disabled={createWallet.isPending}
            aria-label={t('withdraw.addWallet.paste', 'Paste')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-black hover:bg-black/5 active:translate-y-[calc(-50%+1px)] transition disabled:opacity-40"
          >
            <FiClipboard className="w-4 h-4" />
          </button>
        </div>
      </label>

      <p className="text-xs text-gray-500">
        {t('withdraw.addWallet.networkHint', 'This address must be on the {{network}} network.', {
          network: network?.networkName ?? '—',
        })}
      </p>

      {error ? <p className="text-sm text-error font-semibold">{error}</p> : null}

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
