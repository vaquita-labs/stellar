import { describe, expect, it } from 'vitest';
import { countdownFrom, readPaymentInstructions, saveAffordanceFor } from './onrampPayment';

const withScannable = (scannable: unknown) => ({
  depositInstructions: { scannable, fields: [] } as never,
});

const withFields = (fields: unknown) => ({ depositInstructions: { fields } as never });

describe('readPaymentInstructions', () => {
  it('takes the raw payload so the QR can be re-encoded instead of shown as the provider drew it', () => {
    const read = readPaymentInstructions(
      withScannable({
        kind: 'opaque',
        payload: '00020101021226...5802BO',
        payloadLabel: 'Código QR',
        image: { mediaType: 'image/png', encoding: 'base64', data: 'aGk=', inlineSafe: true },
      }),
    );

    expect(read.payload).toBe('00020101021226...5802BO');
    // Con payload no se usa la imagen del proveedor: es justamente la que sale
    // ilegible en tema oscuro y que iOS no guarda.
    expect(read.imageSrc).toBeNull();
  });

  it('falls back to the provider image when the payload is missing, so a QR still shows', () => {
    const read = readPaymentInstructions(
      withScannable({
        kind: 'opaque',
        payload: null,
        payloadLabel: null,
        image: { mediaType: 'image/png', encoding: 'base64', data: 'aGk=', inlineSafe: true },
      }),
    );

    expect(read.payload).toBeNull();
    expect(read.imageSrc).toBe('data:image/jpeg;base64,aGk=');
  });

  it('shows any base64 bitmap as JPEG, whatever the provider labels it or marks it', () => {
    // La forma exacta con la que Stereum manda el QR en producción: bytes JPEG
    // bajo un `mediaType` que dice PNG, sin payload, `inlineSafe: false`.
    // Descartarlo por la marca dejaba la pantalla en "no pudimos cargar el
    // código" con la compra ya creada.
    const read = readPaymentInstructions(
      withScannable({
        kind: 'opaque',
        payload: null,
        payloadLabel: null,
        image: { mediaType: 'image/png', encoding: 'base64', data: '/9j/4AAQ', inlineSafe: false },
      }),
    );

    expect(read.imageSrc).toBe('data:image/jpeg;base64,/9j/4AAQ');
  });

  it('percent-encodes a utf8 SVG instead of labelling it base64, which would not render', () => {
    const read = readPaymentInstructions(
      withScannable({
        kind: 'opaque',
        payload: null,
        payloadLabel: null,
        image: {
          mediaType: 'image/svg+xml',
          encoding: 'utf8',
          data: '<svg viewBox="0 0 2 2"></svg>',
          inlineSafe: true,
        },
      }),
    );

    expect(read.imageSrc).toBe(`data:image/svg+xml;utf8,${encodeURIComponent('<svg viewBox="0 0 2 2"></svg>')}`);
  });

  it('still drops an SVG not marked inline-safe — that format can carry active content', () => {
    const read = readPaymentInstructions(
      withScannable({
        kind: 'opaque',
        payload: null,
        payloadLabel: null,
        image: {
          mediaType: 'image/svg+xml',
          encoding: 'utf8',
          data: '<svg onload="steal()"></svg>',
          inlineSafe: false,
        },
      }),
    );

    expect(read.imageSrc).toBeNull();
  });

  it('reads the expiry out of the instruction fields and keeps it out of the list', () => {
    const read = readPaymentInstructions(
      withFields([
        { key: 'amount', label: 'Monto', value: '350.00', type: 'amount', copyable: true },
        { key: 'expires_at', label: 'Vence', value: '2026-08-27T01:00:00.000Z', type: 'datetime', copyable: false },
      ]),
    );

    expect(read.expiresAt?.toISOString()).toBe('2026-08-27T01:00:00.000Z');
    // El vencimiento se muestra como cuenta regresiva; repetirlo como fecha
    // suelta sólo compite con ella.
    expect(read.fields.map((f) => f.key)).toEqual(['amount']);
  });

  it('reports no expiry when the provider does not publish one, rather than inventing a deadline', () => {
    const read = readPaymentInstructions(
      withFields([{ key: 'reference', label: 'Ref', value: 'AB-1', type: 'code', copyable: true }]),
    );

    expect(read.expiresAt).toBeNull();
    expect(read.fields).toHaveLength(1);
  });

  it('ignores an unparseable expiry instead of showing a countdown from a bad date', () => {
    const read = readPaymentInstructions(
      withFields([{ key: 'expires_at', label: 'Vence', value: 'pronto', type: 'datetime', copyable: false }]),
    );

    expect(read.expiresAt).toBeNull();
  });
});

describe('countdownFrom', () => {
  const at = (iso: string) => new Date(iso);

  it('counts down in minutes and seconds while the code is still good', () => {
    expect(countdownFrom(at('2026-08-27T01:00:00Z'), at('2026-08-27T00:50:35Z'))).toEqual({
      expired: false,
      label: '09:25',
    });
  });

  it('reports expired once the deadline passes, without a negative clock', () => {
    expect(countdownFrom(at('2026-08-27T01:00:00Z'), at('2026-08-27T01:00:01Z'))).toEqual({
      expired: true,
      label: '00:00',
    });
  });

  it('never claims expired when the provider published no deadline', () => {
    // Sin vencimiento el QR se asume vigente: bloquear el pago por una fecha que
    // nadie publicó sería inventarle un límite al proveedor.
    expect(countdownFrom(null, at('2026-08-27T01:00:00Z'))).toEqual({ expired: false, label: null });
  });
});

describe('saveAffordanceFor', () => {
  it('offers the save button on a phone that can share files', () => {
    expect(saveAffordanceFor({ coarsePointer: true, canShareFiles: true })).toBe('share');
  });

  it('falls back to a long-press instruction on a phone that cannot share files', () => {
    // Sin nada visible el usuario se queda mirando un QR que no sabe guardar, y
    // el pago pasa por otra app: tiene que salir de la galería.
    expect(saveAffordanceFor({ coarsePointer: true, canShareFiles: false })).toBe('longPress');
  });

  it('offers nothing on a desktop, where the code is scanned off the screen', () => {
    expect(saveAffordanceFor({ coarsePointer: false, canShareFiles: false })).toBe('none');
  });
});
