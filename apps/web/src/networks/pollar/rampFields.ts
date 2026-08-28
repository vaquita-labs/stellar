import type { RampQuote } from '@pollar/core';
import { RampError } from './ramps';

/**
 * Un campo del formulario que pide el proveedor. Lo define la cotización, no
 * nosotros: cada corredor y cada rail pide datos distintos.
 */
export type RampField = NonNullable<RampQuote['requiredFields']>[number];

/**
 * El ejemplo que se muestra dentro del campo. Puede depender de lo elegido en
 * otro: el formato de cuenta cambia con el banco, y mostrar el ejemplo de otro
 * banco es la forma más fácil de que el usuario mande un dato mal escrito.
 */
export function placeholderFor(field: RampField, fields: RampField[], values: Record<string, string>): string {
  if (field.placeholderFrom) {
    const source = fields.find((f) => f.key === field.placeholderFrom);
    const chosen = source?.options?.find((o) => o.value === values[field.placeholderFrom as string]);
    if (chosen?.placeholder) return chosen.placeholder;
  }
  return field.placeholder ?? field.label;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Un campo suelto: vacío sólo vale si es opcional; el email además tiene forma. */
export function fieldIsValid(field: RampField, raw: string | undefined): boolean {
  const value = (raw ?? '').trim();
  if (!value) return field.optional === true;
  return field.type === 'email' ? EMAIL_RE.test(value) : true;
}

/** Si el formulario entero se puede mandar al proveedor. */
export function fieldsAreValid(fields: RampField[], values: Record<string, string>): boolean {
  return fields.every((field) => fieldIsValid(field, values[field.key]));
}

// Códigos de error de los endpoints de ramps que tienen un mensaje propio; el
// resto cae al texto que mande Pollar. Es la misma tabla para comprar y para
// vender: los códigos salen de la API, no del sentido del flujo.
const ERROR_KEYS: Record<string, string> = {
  SDK_RAMPS_QUOTE_EXPIRED: 'quoteExpired',
  SDK_RAMPS_ASSET_NOT_ENABLED: 'assetNotEnabled',
  SDK_RAMPS_KYC_REQUIRED: 'kycRequired',
  SDK_RAMPS_WALLET_UNSUPPORTED: 'walletUnsupported',
  SDK_RAMPS_PROVIDER_NOT_CONFIGURED: 'providerNotConfigured',
  SDK_RAMPS_ANCHOR_ERROR: 'anchorError',
  SDK_RAMPS_BRIDGE_ERROR: 'anchorError',
};

/**
 * Traduce un fallo de ramps a algo que el usuario pueda leer: código conocido →
 * texto propio, si no el que mande Pollar, y recién al final el genérico.
 *
 * `translate` recibe sólo la hoja de la clave (`quoteExpired`) porque cada flujo
 * la cuelga de su propio namespace: el mismo código dice cosas distintas cuando
 * se está comprando que cuando se está retirando.
 */
export function rampErrorMessage(error: unknown, translate: (leafKey: string) => string, fallback: string): string {
  const code = error instanceof RampError ? error.code : undefined;
  const key = code ? ERROR_KEYS[code] : undefined;
  if (key) return translate(key);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
