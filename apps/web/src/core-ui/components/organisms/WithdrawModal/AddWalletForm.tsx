'use client';

import { Button, Spinner, toast } from '@heroui/react';
import { StrKey } from '@stellar/stellar-sdk';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdContentPaste } from 'react-icons/md';
import { useIsMobile } from '../../../hooks';
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
 * Valida que una dirección tenga el formato de la red destino, para no dejar
 * guardar (ni pegar) texto que no es una wallet. El slug se compara por prefijo:
 * `stellar` cubre `stellar` y `stellar-testnet`; los EVM comparten formato 0x.
 */
const isValidAddressForNetwork = (address: string, networkSlug: string): boolean => {
  const addr = address.trim();
  if (!addr) return false;

  if (networkSlug.startsWith('stellar')) {
    // Clave pública ed25519 (G...) o dirección muxed (M...).
    return StrKey.isValidEd25519PublicKey(addr) || StrKey.isValidMed25519PublicKey(addr);
  }
  if (['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'avalanche'].some((n) => networkSlug.startsWith(n))) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
  // Red desconocida: no se puede afirmar el formato, se acepta no vacío y el
  // backend hace la validación final.
  return addr.length > 0;
};

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

  // El botón de pegar se muestra solo en pantallas chicas (mobile), donde pegar
  // es un gesto largo y el atajo de un toque ayuda. En desktop el pegado natural
  // es Ctrl/Cmd+V dentro del campo, así que el botón sobra.
  const isMobile = useIsMobile();

  const networkSlug = toNetworkSlug(network?.networkName ?? '');
  const trimmedLabel = label.trim();
  const trimmedAddress = address.trim();
  const addressValid = isValidAddressForNetwork(trimmedAddress, networkSlug);
  // El error de formato se muestra solo si ya hay algo escrito (no en vacío).
  const addressFormatError = trimmedAddress.length > 0 && !addressValid;
  const canSubmit = trimmedLabel.length > 0 && addressValid && !createWallet.isPending;

  // Atajo de pegado para táctil. `clipboard.readText` solo funciona en contexto
  // seguro (HTTPS/producción); si falla (dev por http en IP, permiso denegado)
  // se enfoca el campo en silencio para que el usuario pegue con el gesto nativo
  // — sin toast de advertencia, porque el pegado manual siempre está disponible.
  const handlePaste = async () => {
    const readText = navigator?.clipboard?.readText?.bind(navigator.clipboard);
    if (readText) {
      try {
        const text = (await readText())?.trim();
        if (text) {
          // Si lo copiado no tiene forma de dirección de la red, no se pega:
          // así no entra por error una URL, un monto, un texto cualquiera.
          if (!isValidAddressForNetwork(text, networkSlug)) {
            toast.danger(
              t('withdraw.addWallet.pasteInvalid', "That doesn't look like a valid {{network}} address", {
                network: network?.networkName ?? '—',
              }),
            );
            return;
          }
          setAddress(text);
          if (error) setError(null);
        }
        return;
      } catch {
        // Sin permiso de lectura: cae al foco silencioso para pegado manual.
      }
    }
    addressInputRef.current?.focus();
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
        network: networkSlug,
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
            className={inputClasses + ' font-mono text-xs' + (isMobile ? ' pr-11' : '')}
          />
          {/* Solo en mobile: en desktop se pega con Ctrl/Cmd+V dentro del campo. */}
          {isMobile ? (
            <button
              type="button"
              onClick={handlePaste}
              disabled={createWallet.isPending}
              aria-label={t('withdraw.addWallet.paste', 'Paste')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-md text-black hover:bg-black/5 active:translate-y-[calc(-50%+1px)] transition disabled:opacity-40"
            >
              <MdContentPaste className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </label>

      <p className="text-xs text-gray-500">
        {t('withdraw.addWallet.networkHint', 'This address must be on the {{network}} network.', {
          network: network?.networkName ?? '—',
        })}
      </p>

      {addressFormatError ? (
        <p className="text-sm text-error font-semibold">
          {t('withdraw.addWallet.invalidAddress', "That doesn't look like a valid {{network}} address", {
            network: network?.networkName ?? '—',
          })}
        </p>
      ) : error ? (
        <p className="text-sm text-error font-semibold">{error}</p>
      ) : null}

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
