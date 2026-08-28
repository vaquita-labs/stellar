import type { RampDepositInstructions, RampInstructionField, RampScannable } from '@pollar/core';

/** Lo que hace falta para dibujar la pantalla de pago. */
export interface PaymentInstructions {
  /** Payload crudo del QR, cuando el proveedor lo publica. */
  payload: string | null;
  /** Imagen del proveedor como data URL. Sólo cuando no hay payload. */
  imageSrc: string | null;
  /** Campos a mostrar, sin el vencimiento (lo dibuja la cuenta regresiva). */
  fields: RampInstructionField[];
  /** Cuándo vence el QR, o null si el proveedor no lo publica. */
  expiresAt: Date | null;
}

/** Fuente de las instrucciones: la creación y la lectura traen la misma forma. */
export interface WithDepositInstructions {
  depositInstructions?: RampDepositInstructions;
}

/**
 * Normaliza las instrucciones de depósito del proveedor a lo que la pantalla de
 * pago necesita.
 */
export function readPaymentInstructions(source: WithDepositInstructions): PaymentInstructions {
  const scannable = source.depositInstructions?.scannable;
  const payload = scannable?.payload ?? null;
  const all = source.depositInstructions?.fields ?? [];
  const expiry = all.find((field) => field.key === EXPIRES_KEY);
  const parsed = expiry ? new Date(expiry.value) : null;

  return {
    payload,
    imageSrc: payload ? null : imageSrcOf(scannable?.image),
    fields: all.filter((field) => field.key !== EXPIRES_KEY),
    // Una fecha que no parsea se descarta: una cuenta regresiva desde NaN diría
    // "vencido" sobre un QR que todavía sirve.
    expiresAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  };
}

/** Clave con la que el proveedor publica el vencimiento del QR. */
const EXPIRES_KEY = 'expires_at';

/**
 * La imagen del proveedor como data URL, o null si no se puede usar.
 *
 * `inlineSafe` es del proveedor y se respeta: una imagen marcada como no segura
 * es SVG con contenido activo, y meterla en un `<img>` de nuestro origen es
 * exactamente lo que esa marca pide evitar. Sin imagen la pantalla igual sirve
 * (quedan los campos copiables); con un SVG hostil, no.
 */
function imageSrcOf(image: NonNullable<RampScannable['image']> | undefined): string | null {
  if (!image?.data || image.inlineSafe === false) return null;
  // El proveedor manda SVG en texto plano: etiquetarlo `base64` no lo decodifica
  // y el `<img>` queda roto sin ninguna señal.
  return image.encoding === 'utf8'
    ? `data:${image.mediaType};utf8,${encodeURIComponent(image.data)}`
    : `data:${image.mediaType};base64,${image.data}`;
}

/** Estado de la cuenta regresiva del QR. */
export interface Countdown {
  expired: boolean;
  /** `mm:ss`, o null si no hay vencimiento que mostrar. */
  label: string | null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Cuánto queda para que venza el QR.
 *
 * Sin vencimiento publicado NO se considera vencido: el proveedor es el único
 * que sabe hasta cuándo vale el código, y darlo por muerto por nuestra cuenta le
 * cortaría el pago a un usuario que todavía está a tiempo.
 */
export function countdownFrom(expiresAt: Date | null, now: Date): Countdown {
  if (!expiresAt) return { expired: false, label: null };
  const left = Math.max(0, expiresAt.getTime() - now.getTime());
  const seconds = Math.floor(left / 1000);
  return { expired: left <= 0, label: `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}` };
}

/** Qué se le ofrece al usuario para llevarse el QR. */
export type SaveAffordance = 'share' | 'longPress' | 'none';

/**
 * Qué mostrar debajo del QR según el dispositivo.
 *
 * El pago ocurre en OTRA app (la del banco), así que en el teléfono el código
 * tiene que poder salir de acá: primero el botón de guardar, y si el navegador
 * no sabe compartir archivos, al menos la instrucción de mantener apretado. En
 * escritorio no se ofrece nada porque el QR se escanea de la pantalla con el
 * teléfono, y un botón de descarga ahí sólo deja un PNG suelto que nadie usa.
 */
export function saveAffordanceFor(device: { coarsePointer: boolean; canShareFiles: boolean }): SaveAffordance {
  if (!device.coarsePointer) return 'none';
  return device.canShareFiles ? 'share' : 'longPress';
}
