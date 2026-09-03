import { StrKey } from '@stellar/stellar-sdk';
import { nicknameSegment } from './nickname';

export type SendDestination =
  | { kind: 'empty' }
  /** Una dirección Stellar tipeada directo. `value` es la G… lista para usar. */
  | { kind: 'address'; value: string }
  /** Un @usuario. `value` es el segmento que va a la API, ya sin el `@`. */
  | { kind: 'handle'; value: string }
  | { kind: 'invalid' };

/**
 * Decide qué escribió el usuario en el campo de destino.
 *
 * Clasifica por el `@` EXPLÍCITO y no por la forma del texto: si alguien tipea
 * mal una dirección (`GXXX…` con un carácter de menos) lo que corresponde es
 * decirle "esa dirección no es válida", no salir a buscar un usuario que se
 * llame así y después decirle "no encontramos a ese usuario", que manda a
 * revisar el lugar equivocado.
 */
export function classifyDestination(input: string): SendDestination {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };

  if (trimmed.startsWith('@')) {
    const segment = nicknameSegment(trimmed);
    return segment ? { kind: 'handle', value: segment } : { kind: 'invalid' };
  }

  if (StrKey.isValidEd25519PublicKey(trimmed) || StrKey.isValidMed25519PublicKey(trimmed)) {
    return { kind: 'address', value: trimmed };
  }

  return { kind: 'invalid' };
}
