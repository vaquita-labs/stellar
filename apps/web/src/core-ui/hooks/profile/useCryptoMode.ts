import { useProfileData } from './useProfileData';

/**
 * Preferencia "Sé de cripto" (`profile.cryptoSavvy`): la única regla que decide
 * si la UI muestra detalle on-chain —hash de transacción, dirección cruda,
 * link al explorador— o si lo esconde detrás de lenguaje de plata común.
 *
 * Arranca en `false` mientras el perfil carga a propósito: si el default fuera
 * "mostrar", cada pantalla parpadearía datos on-chain a alguien que pidió no
 * verlos, y eso no se puede deshacer una vez que se vio.
 */
export const useCryptoMode = (): boolean => {
  const { data: profile } = useProfileData();
  return profile?.cryptoSavvy ?? false;
};
