import { describe, expect, it } from 'vitest';

import es from './locales/es.json';

// El español de la app es el boliviano: tuteo en toda la interfaz, `usted`
// reservado para los documentos legales. `locale-parity` sólo compara sets de
// claves, así que una cadena nueva escrita en voseo rioplatense —"probá",
// "tenés", "elegí"— pasa en verde ahí y llega a producción.
//
// Este candado mira el texto. No intenta validar gramática: busca las formas
// que marcan el registro equivocado, que son pocas y muy reconocibles.
//
// Sólo se listan formas ACENTUADAS o inequívocas. `toca`, `guarda`, `mira` y
// `deja` son imperativos de tuteo perfectamente válidos y no pueden entrar acá:
// lo que delata al voseo es la tilde final (`tocá`) o la raíz (`tenés`, `sos`).

type Json = string | { [key: string]: Json };

const flatten = (value: Json, prefix = ''): Record<string, string> => {
  if (typeof value === 'string') return { [prefix]: value };
  return Object.entries(value).reduce<Record<string, string>>(
    (acc, [key, child]) => Object.assign(acc, flatten(child, prefix ? `${prefix}.${key}` : key)),
    {},
  );
};

/**
 * Presente de indicativo e imperativos del voseo.
 *
 * Van por alternancia explícita y no por un patrón tipo `\w+ás` porque el
 * español tiene palabras legítimas con esa terminación —"además", "después",
 * "inglés", "interés"— y un patrón abierto las marcaría a todas.
 */
const VOSEO = [
  // presente de indicativo
  'podés', 'tenés', 'querés', 'sabés', 'debés', 'sos', 'estás confiando',
  'usás', 'seguís', 'iniciás', 'conectás', 'activás', 'abrís', 'retirás',
  'perdés', 'elegís', 'recibís', 'mantenés', 'competís', 'decidís',
  'necesitás', 'vivís', 'dependés', 'entendés', 'confirmás', 'aceptás',
  'declarás', 'encontrás', 'figurás', 'comprometés', 'creés', 'pagás',
  'depositás', 'llevás', 'mostrás', 'ponés', 'hacés',
  // imperativos
  'probá', 'elegí', 'revisá', 'agregá', 'empezá', 'tocá', 'mirá', 'ahorrá',
  'compartí', 'escribí', 'volvé', 'dejá', 'poné', 'guardá', 'pedí', 'abrí',
  'andá', 'hacé', 'sumá', 'creá', 'activá', 'confirmá', 'completá', 'cambiá',
  'copiá', 'esperá', 'intentá', 'depositá', 'aprovechá', 'enterate', 'fijate',
  'mandale', 'pedile', 'contactanos', 'escribinos', 'abrila', 'terminala',
  'traelo', 'aceptá', 'entrá',
];

// El pronombre entra a la misma lista: lo que hace falta en todos los casos es
// el límite de palabra. Sin él "recursos" contiene "sos" y "pesos" también.
VOSEO.push('vos');

/** `true` si `form` aparece en `text` como palabra suelta, no como sufijo. */
const usesForm = (text: string, form: string): boolean =>
  new RegExp(`(^|[^\\p{L}])${form}([^\\p{L}]|$)`, 'iu').test(text);

/**
 * Léxico rioplatense que en Bolivia se dice de otra forma, más "móvil" (España)
 * y la tilde vieja de "sólo", que la RAE ya no pide desde 2010.
 */
const LEXICON: Array<{ pattern: RegExp; preferred: string; except?: RegExp }> = [
  // "Medallista de Plata" es el metal de la insignia, no el rioplatismo por
  // dinero, y es la única excepción real que tiene el bundle.
  { pattern: /(^|[^\p{L}])plata([^\p{L}]|$)/iu, preferred: 'dinero', except: /^achievements\./ },
  { pattern: /(^|[^\p{L}])acá([^\p{L}]|$)/iu, preferred: 'aquí' },
  { pattern: /(^|[^\p{L}])móvil(es)?([^\p{L}]|$)/iu, preferred: 'celular' },
  { pattern: /(^|[^\p{L}])sólo([^\p{L}]|$)/iu, preferred: 'solo' },
];

const strings = Object.entries(flatten(es as Json));

describe('es.json está en español boliviano', () => {
  it('no usa formas de voseo', () => {
    const offenders = strings.flatMap(([key, value]) => {
      const hits = VOSEO.filter((form) => usesForm(value, form));
      return hits.length > 0 ? [`${key}: ${hits.join(', ')}`] : [];
    });

    expect(offenders, 'escribir en tuteo: "puedes", "elige", "intenta"').toEqual([]);
  });

  it('no usa léxico rioplatense ni ortografía vieja', () => {
    const offenders = strings.flatMap(([key, value]) =>
      LEXICON.filter((rule) => rule.pattern.test(value) && !rule.except?.test(key)).map(
        (rule) => `${key}: ${rule.pattern.source} → "${rule.preferred}"`,
      ),
    );

    expect(offenders, 'usar el término boliviano').toEqual([]);
  });
});
