'use client';

import { Spinner } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle } from 'react-icons/fi';
import { truncateMiddle } from '../../../helpers';
import { nicknameSegment } from '../../../helpers/nickname';
import { useWalletByUsername } from '../../../hooks';
import { SavedWallet, useCreateSavedWallet } from '../../../hooks/useSavedWallets';
import { useConfigStore } from '../../../stores';
import { Notice } from '../../molecules/Notice';
import { PressableButton } from '../../molecules/PressableButton';
import { avatarBackgroundColor, VaquitaAvatarCircle } from '../../avatar/VaquitaAvatar';

interface AddNicknameFormProps {
  onCreated: (wallet: SavedWallet) => void;
}

/** Caja del estado de la búsqueda: mismo alto y forma que `Notice`. */
const STATUS_CARD = 'flex min-h-14 items-center gap-2.5 rounded-xl border px-4 py-1.5 text-sm';

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

      {/* Un solo lugar de estado abajo del campo, y en los tres casos lo ocupa
          una tarjeta del MISMO alto: buscando, no existe, encontrado. Así la
          pantalla no salta entre uno y otro, y tampoco queda un renglón suelto
          con un hueco abajo, que era lo que pasaba cuando el aviso era solo
          texto dentro de un espacio reservado para la tarjeta. Con el campo
          vacío no hay estado que mostrar y no se reserva nada. */}
      {!segment ? null : resolving ? (
        <div className={`${STATUS_CARD} border-black/10 bg-white/60 text-gray-500`} role="status">
          <Spinner size="sm" color="current" />
          {t('wallet.send.resolving', 'Looking up…')}
        </div>
      ) : isSelf ? (
        <Notice tone="warn" className="min-h-14 items-center!">
          {t('wallet.send.sameAddress', "You can't send to your own address.")}
        </Notice>
      ) : notFound ? (
        <Notice tone="warn" className="min-h-14 items-center!">
          {t('wallet.send.handleNotFound', "We couldn't find that user.")}
        </Notice>
      ) : destAddress ? (
        // El fondo es el del avatar de esa persona, no un verde de "ok": la
        // tarjeta es SU tarjeta. El borde va en negro suave porque uno de los
        // fondos de la paleta es casi el crema de la hoja y sin borde la
        // tarjeta se perdería.
        <div
          className={`${STATUS_CARD} border-black/15`}
          style={{ backgroundColor: avatarBackgroundColor(lookup.avatarConfig, destAddress) }}
          role="status"
        >
          {/* La cara de la persona, no un ícono genérico: es lo que deja
              confirmar de un vistazo que el vaquitag es de quien uno cree. Sin
              config guardada sale el avatar sembrado con su dirección, el mismo
              que ve el resto de la app. */}
          <VaquitaAvatarCircle
            config={lookup.avatarConfig}
            seed={destAddress}
            alt={`@${segment}`}
            className="h-10 w-10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-black truncate">@{segment}</p>
            {/* La dirección se muestra siempre: es lo que se guarda y lo que va
                a recibir la plata. */}
            <p className="font-mono text-xs text-gray-600">{truncateMiddle(destAddress, 6, 5)}</p>
          </div>
          <FiCheckCircle className="h-4 w-4 shrink-0 text-[#3F9102]" />
        </div>
      ) : null}

      {error ? <p className="text-sm text-error font-semibold">{error}</p> : null}

      <PressableButton variant="success" size="cta" className="!py-3.5" onClick={handleSubmit} disabled={!canSubmit}>
        {createWallet.isPending ? <Spinner size="sm" color="current" /> : null}
        {t('withdraw.addWallet.save', 'Save wallet')}
      </PressableButton>
    </div>
  );
}
