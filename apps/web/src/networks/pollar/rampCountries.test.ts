import { describe, expect, it } from 'vitest';
import { rampCountryCodes } from './rampCountries';

/** La respuesta real trae más campos; acá sólo importa `countries`. */
const response = (countries: Array<{ code: string; currency: string | null }>) =>
  ({ countries }) as Parameters<typeof rampCountryCodes>[0];

describe('rampCountryCodes', () => {
  it('keeps the codes the provider publishes, so a listed corridor can open', () => {
    expect(
      rampCountryCodes(
        response([
          { code: 'BO', currency: 'BOB' },
          { code: 'BR', currency: 'BRL' },
        ]),
      ),
    ).toEqual(['BO', 'BR']);
  });

  it('matches a code the provider wrote in lowercase', () => {
    // El picker compara contra 'BO' en mayúsculas: sin normalizar, un 'bo' del
    // proveedor apagaría un corredor que en realidad está habilitado.
    expect(rampCountryCodes(response([{ code: ' bo ', currency: 'BOB' }]))).toEqual(['BO']);
  });

  it('yields nothing when the provider lists no country at all', () => {
    // Es el caso de testnet, donde el corredor no existe. Vacío = todo apagado,
    // que es exactamente lo que tiene que pasar.
    expect(rampCountryCodes(response([]))).toEqual([]);
  });

  it('yields nothing when there was no response to read', () => {
    expect(rampCountryCodes(undefined)).toEqual([]);
    expect(rampCountryCodes(null)).toEqual([]);
  });

  it('drops entries with no usable code instead of enabling an empty country', () => {
    const dirty = [
      { code: '', currency: 'BOB' },
      { code: '   ', currency: null },
    ] as Array<{
      code: string;
      currency: string | null;
    }>;
    expect(rampCountryCodes(response(dirty))).toEqual([]);
  });

  it('lists a country once even if the provider repeats it', () => {
    expect(
      rampCountryCodes(
        response([
          { code: 'BO', currency: 'BOB' },
          { code: 'bo', currency: 'BOB' },
        ]),
      ),
    ).toEqual(['BO']);
  });
});
