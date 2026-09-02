import { describe, expect, it } from 'vitest';

import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';

// Los otros dos tests de i18n (`badge-keys`, `legal-keys`) cubren su namespace y
// nada más, así que agregar una clave a `en.json` y olvidarse de `es`/`pt` pasa
// en verde. Lo que ve el usuario en ese caso no es inglés: `t()` cae al segundo
// argumento si lo hay, y si no imprime la ruta de la clave.
//
// Los tres bundles están parejos hoy, así que esto no es una limpieza pendiente
// sino un candado: alcanza con que el set de claves sea el mismo.

const LOCALES = { es, pt } as const;

type Json = string | { [key: string]: Json };

/** Aplana un bundle anidado en pares `a.b.c` → valor. */
const flatten = (value: Json, prefix = ''): Record<string, string> => {
  if (typeof value === 'string') return { [prefix]: value };
  return Object.entries(value).reduce<Record<string, string>>(
    (acc, [key, child]) => Object.assign(acc, flatten(child, prefix ? `${prefix}.${key}` : key)),
    {},
  );
};

const keysOf = (bundle: unknown) => Object.keys(flatten(bundle as Json)).sort();

describe('locale key parity', () => {
  const expected = keysOf(en);

  for (const [lng, bundle] of Object.entries(LOCALES)) {
    it(`${lng} has exactly the keys en has`, () => {
      const actual = keysOf(bundle);
      // Se reportan los dos lados por separado: "faltan 3" y "sobran 3" son
      // problemas distintos —una traducción sin hacer y una clave muerta— y el
      // diff de un array de miles de strings no lo dice.
      expect(expected.filter((k) => !actual.includes(k)), `${lng}: claves sin traducir`).toEqual([]);
      expect(actual.filter((k) => !expected.includes(k)), `${lng}: claves que ya no existen en en`).toEqual([]);
    });
  }

  it('leaves no string empty in any locale', () => {
    for (const [lng, bundle] of Object.entries({ en, ...LOCALES })) {
      for (const [key, value] of Object.entries(flatten(bundle as Json))) {
        expect(value.trim(), `${lng}.${key} está vacío`).toBeTruthy();
      }
    }
  });
});
