'use client';

import { Spinner } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { truncateMiddle } from '../../../helpers';
import { nicknameSegment } from '../../../helpers/nickname';
import { useWalletByUsername } from '../../../hooks';
import { SavedWallet, useCreateSavedWallet } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';
import { PressableButton } from '../../molecules/PressableButton';

interface AddNicknameFormProps {
  onCreated: (wallet: SavedWallet) => void;
}

/** Mismo criterio que `AddWalletForm`: el backend valida el slug canónico. */
const toNetworkSlug = (networkName: string) => networkName.trim().toLowerCase().replace(/\s+/g, '-');

/**
 * Alta de un destino por nombre de usuario, en vez de por dirección.
 *
 * Es el mismo `saved_wallets` que carga `AddWalletForm`: lo que se guarda es
 * siempre la dirección, nunca el nombre. Un usuario puede renombrarse, así que
 * resolver una vez y guardar el resultado es lo único que deja el destino
 * estable — y es también lo que se le muestra antes de guardar, porque lo que
 * aprueba es la dirección.
 */
export function AddNicknameForm({ onCreated }: AddNicknameFormProps) {
  const { t } = useTranslation();
  const { network, walletAddress } = useConfigStore();
  const createWallet = useCreateSavedWallet();

  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const segment = nicknameSegment(username);
  const lookup = useWalletByUsername(username);

  const networkSlug = toNetworkSlug(network?.networkName ?? '');
  const resolving = !!segment && lookup.isLoading;
  const notFound = !!segment && lookup.notFound;
  const destAddress = segment ? lookup.walletAddress : null;
  // Guardarse a uno mismo como destino de retiro no es un destino: la plata
  // volvería a la misma wallet de la que sale.
  const isSelf = !!destAddress && !!walletAddress && destAddress === walletAddress;
  const canSubmit = !!destAddress && !isSelf && !resolving && !createWallet.isPending;

  const inputClasses =
    'w-full rounded-md border border-black border-b-2 bg-white h-12 pl-7 pr-3 text-black ' +
    'placeholder:text-gray-400 outline-none focus:border-b-3 disabled:opacity-50';

  const handleSubmit = async () => {
    if (!canSubmit || !destAddress) return;
    setError(null);
    try {
      const wallet = await createWallet.mutateAsync({
        // El nombre queda con el `@` adelante para que en la lista se lea como
        // una persona y no como otra cuenta de exchange.
        label: `@${segment}`.slice(0, 60),
        address: destAddress,
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
          {t('withdraw.addNickname.field', 'Username')}
        </span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black font-bold select-none">@</span>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('withdraw.addNickname.placeholder', 'username')}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError(null);
            }}
            maxLength={60}
            disabled={createWallet.isPending}
            className={inputClasses}
          />
        </div>
      </label>

      {/* Un solo renglón de estado abajo del campo, para que la pantalla no
          salte entre "buscando" y el resultado. */}
      <div className="min-h-10">
        {resolving ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Spinner size="sm" color="current" />
            {t('wallet.send.resolving', 'Looking up…')}
          </p>
        ) : isSelf ? (
          <p className="text-sm text-error font-semibold">
            {t('wallet.send.sameAddress', "You can't send to your own address.")}
          </p>
        ) : notFound ? (
          <p className="text-sm text-error font-semibold">
            {t('wallet.send.handleNotFound', "We couldn't find that user.")}
          </p>
        ) : destAddress ? (
          <div className="rounded-lg border border-black border-b-2 bg-white px-3 py-2">
            <p className="text-sm font-bold text-black truncate">@{segment}</p>
            {/* La dirección se muestra siempre: es lo que se guarda y lo que va
                a recibir la plata. */}
            <p className="font-mono text-xs text-gray-500">{truncateMiddle(destAddress, 6, 5)}</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-error font-semibold">{error}</p> : null}

      <PressableButton variant="success" size="cta" className="!py-3.5" onClick={handleSubmit} disabled={!canSubmit}>
        {createWallet.isPending ? <Spinner size="sm" color="current" /> : null}
        {t('withdraw.addWallet.save', 'Save wallet')}
      </PressableButton>
    </div>
  );
}
