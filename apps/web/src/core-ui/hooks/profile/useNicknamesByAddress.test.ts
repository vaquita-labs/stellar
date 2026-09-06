import { describe, expect, it } from 'vitest';
import { SavedWallet } from '../useSavedWallets';

/**
 * La regla que decide en qué lista del retiro cae cada destino guardado, y con
 * qué nombre se muestra. Vive en `WithdrawModal`; se replica acá tal cual para
 * fijarla, porque de ella depende que una dirección no quede invisible en la
 * pantalla donde el usuario la busca.
 */
const isUser = (w: SavedWallet, nicknames: Map<string, string | null>) => !!nicknames.get(w.address);
const isAddress = (w: SavedWallet, nicknames: Map<string, string | null>) => nicknames.get(w.address) === null;
const labelFor = (w: SavedWallet, nicknames: Map<string, string | null>) => {
  const nickname = nicknames.get(w.address);
  return nickname ? `@${nickname}` : w.label;
};

const wallet = (label: string, address: string): SavedWallet => ({
  id: address,
  label,
  address,
  memo: null,
  network: 'stellar',
  createdTimestamp: 0,
  updatedTimestamp: 0,
});

// El caso real que destapó el bug: la dirección de @oscargauss guardada con el
// nombre "My wallet". Con el corte por prefijo `@` caía en la lista de wallets,
// era invisible entre los usuarios, y volver a agregarla chocaba con un 409.
const MY_WALLET = wallet('My wallet', 'GCTR62LHPGRWR5FMKEW7XU3A6UXHE2FTT3TGGKSQDLNBFNYDENEB72US');
const EXCHANGE = wallet('Binance USDC', 'GBINANCEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

describe('clasificación de destinos guardados', () => {
  it('lista entre los usuarios una dirección de usuario, sin importar el nombre guardado', () => {
    const nicknames = new Map([[MY_WALLET.address, 'oscargauss']]);

    expect(isUser(MY_WALLET, nicknames)).toBe(true);
    expect(isAddress(MY_WALLET, nicknames)).toBe(false);
  });

  it('muestra el nickname de ahora y no el nombre con el que se guardó', () => {
    const nicknames = new Map([[MY_WALLET.address, 'oscargauss']]);

    expect(labelFor(MY_WALLET, nicknames)).toBe('@oscargauss');
  });

  it('sigue el renombre: la misma dirección pasa a mostrar el nombre nuevo', () => {
    const antes = new Map([[MY_WALLET.address, 'oscargauss']]);
    const despues = new Map([[MY_WALLET.address, 'oscar_2']]);

    expect(labelFor(MY_WALLET, antes)).toBe('@oscargauss');
    expect(labelFor(MY_WALLET, despues)).toBe('@oscar_2');
  });

  it('deja en la lista de wallets lo que no es un usuario, con su nombre propio', () => {
    const nicknames = new Map([[EXCHANGE.address, null]]);

    expect(isAddress(EXCHANGE, nicknames)).toBe(true);
    expect(isUser(EXCHANGE, nicknames)).toBe(false);
    expect(labelFor(EXCHANGE, nicknames)).toBe('Binance USDC');
  });

  // Sin resolver, la dirección no entra en NINGUNA lista: meterla en la de
  // wallets por defecto es exactamente el bug de antes, y meterla en la de
  // usuarios prometería un nombre que todavía no se conoce.
  it('no adivina mientras no sabe si la dirección es de un usuario', () => {
    const vacio = new Map<string, string | null>();

    expect(isUser(MY_WALLET, vacio)).toBe(false);
    expect(isAddress(MY_WALLET, vacio)).toBe(false);
  });

  it('cae al nombre guardado mientras no sabe, en vez de dejar la fila sin nombre', () => {
    const vacio = new Map<string, string | null>();

    expect(labelFor(MY_WALLET, vacio)).toBe('My wallet');
    expect(labelFor(EXCHANGE, vacio)).toBe('Binance USDC');
  });

  it('reparte cada destino en una sola lista', () => {
    const nicknames = new Map([
      [MY_WALLET.address, 'oscargauss'],
      [EXCHANGE.address, null],
    ]);
    const saved = [MY_WALLET, EXCHANGE];

    const users = saved.filter((w) => isUser(w, nicknames));
    const addresses = saved.filter((w) => isAddress(w, nicknames));

    expect(users).toEqual([MY_WALLET]);
    expect(addresses).toEqual([EXCHANGE]);
  });
});
