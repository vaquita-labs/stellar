/**
 * Esperar a que el proveedor verifique la identidad del usuario.
 *
 * Algunos proveedores no venden hasta haberlo hecho, y no todos publican un link
 * a dónde hacerlo: cuando no lo hay, lo único que le queda al usuario es
 * esperar, y sin preguntar por él quedaría adivinando cuándo reintentar. Por eso
 * la espera es un módulo aparte y sin nada de React: la usan el retiro y la
 * compra, y así se puede probar el ciclo entero —aprobación, cancelación,
 * consultas que fallan, límite de tiempo— sin relojes de verdad.
 */

/** Cómo terminó la espera por la verificación de identidad. */
export type KycWaitOutcome = 'approved' | 'cancelled' | 'timeout';

export interface KycWaitOptions {
  /** Le pregunta al proveedor por el estado de la verificación. */
  readStatus: () => Promise<{ hasApproved: boolean }>;
  /** Corta la espera. Se consulta antes de cada pregunta al proveedor. */
  shouldStop?: () => boolean;
  /** Cada cuánto se vuelve a preguntar. */
  intervalMs?: number;
  /** Hasta cuándo vale la pena esperar. */
  timeoutMs?: number;
  /** Para los tests: por defecto duerme de verdad. */
  sleep?: (ms: number) => Promise<void>;
  /** Para los tests: por defecto el reloj del sistema. */
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Pregunta por la verificación hasta que la aprueben, se cierre la pantalla o se
 * agote el tiempo. Nunca lanza: quien la llama decide qué mostrar en cada caso.
 */
export async function waitForKycApproval({
  readStatus,
  shouldStop,
  intervalMs = 10_000,
  timeoutMs = 30 * 60 * 1000,
  sleep = realSleep,
  now = Date.now,
}: KycWaitOptions): Promise<KycWaitOutcome> {
  const start = now();
  for (;;) {
    if (shouldStop?.()) return 'cancelled';
    try {
      const { hasApproved } = await readStatus();
      if (hasApproved) return 'approved';
    } catch {
      // El proveedor todavía no tiene registro del usuario, o la red falló: en
      // los dos casos la respuesta es "todavía no", no "nunca".
    }
    if (now() - start > timeoutMs) return 'timeout';
    await sleep(intervalMs);
  }
}

/** Una compra frenada hasta que el proveedor verifique al usuario. */
export interface KycNeed {
  /** Link de verificación del proveedor, o null si no publica ninguno. */
  url: string | null;
}

/** Qué verificación pide una compra recién creada, o null si no pide ninguna. */
export function kycNeededBy(created: { kycRequired?: boolean; kycUrl?: string }): KycNeed | null {
  return created.kycRequired ? { url: created.kycUrl ?? null } : null;
}

/** Código con el que la API rechaza una operación hasta verificar al usuario. */
const KYC_REQUIRED_CODE = 'SDK_RAMPS_KYC_REQUIRED';

/**
 * Si un fallo es en realidad "falta verificarte".
 *
 * Pollar contesta la misma situación de dos formas —un 200 con `kycRequired` o
 * un error con este código—, así que las dos tienen que terminar en la pantalla
 * de verificación y no en un mensaje de error.
 */
export function isKycRequiredError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === KYC_REQUIRED_CODE;
}
