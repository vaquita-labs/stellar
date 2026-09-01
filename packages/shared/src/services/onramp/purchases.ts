/**
 * Memoria del servidor sobre una compra de USDC con moneda local.
 *
 * Existe porque la API de ramps no tiene endpoint de listado: el id que devuelve
 * la creación es el único handle sobre la compra, y perderlo deja al usuario
 * pagado y sin pantalla a la que volver.
 *
 * Todo se define contra {@link OnrampPurchaseRepository} y no contra Prisma, así
 * que el servicio se prueba entero con un fake en memoria.
 */

/**
 * Los tres finales sin acreditar se distinguen porque cada uno cuenta otra cosa:
 * `expired` venció el QR sin que nadie lo pagara, `failed` la rechazó el
 * proveedor, y `cancelled` la abandonó el usuario a mano teniendo el código
 * todavía vivo. Mezclarlos haría ilegible el embudo — el que cancela eligió irse
 * y el que dejó vencer se distrajo, y no se arreglan igual.
 */
export type OnrampPurchaseStatus = 'pending' | 'paid' | 'settled' | 'expired' | 'failed' | 'cancelled';

/** Estados en los que la compra ya terminó y no hay nada que retomar. */
export const TERMINAL_ONRAMP_STATUSES: OnrampPurchaseStatus[] = ['settled', 'expired', 'failed', 'cancelled'];

export interface OnrampPurchaseRecord {
  id: string;
  walletAddress: string;
  providerTxId: string;
  provider: string;
  country: string;
  amountFiat: string;
  currency: string;
  status: OnrampPurchaseStatus;
  expiresAt?: Date | null;
  lastPolledAt?: Date | null;
  errorReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnrampPurchaseRepository {
  create(input: Omit<OnrampPurchaseRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<OnrampPurchaseRecord>;
  getById(id: string): Promise<OnrampPurchaseRecord | null>;
  /** La compra sin terminar de esa wallet, si hay alguna. */
  findOpenForWallet(walletAddress: string): Promise<OnrampPurchaseRecord | null>;
  update(id: string, patch: Partial<OnrampPurchaseRecord>): Promise<OnrampPurchaseRecord>;
}

export interface RecordOnrampPurchaseInput {
  walletAddress: string;
  providerTxId: string;
  provider: string;
  country: string;
  amountFiat: string;
  currency: string;
  expiresAt?: Date | null;
}

/**
 * Qué encontró la búsqueda. Es un resultado con forma en vez de un registro
 * suelto porque "venció" y "no hay nada" llevan a pantallas distintas, y una
 * compra fallida no es ninguna de las dos: ya terminó, así que no aparece acá.
 */
export type PendingOnrampPurchase =
  | { state: 'none' }
  | { state: 'pending'; purchase: OnrampPurchaseRecord }
  | { state: 'expired'; purchase: OnrampPurchaseRecord };

/** Deja registrada una compra recién creada con el proveedor. */
export async function recordOnrampPurchase(
  repository: OnrampPurchaseRepository,
  input: RecordOnrampPurchaseInput,
): Promise<OnrampPurchaseRecord> {
  return repository.create({
    ...input,
    status: 'pending',
    expiresAt: input.expiresAt ?? null,
    lastPolledAt: null,
    errorReason: null,
  });
}

/**
 * Cuánto se sigue ofreciendo una compra después de que venció su código.
 *
 * Es largo a propósito: cerrarla la saca de la pantalla para siempre, y el
 * usuario que vuelve al rato —el pago quedó a medias, cerró la app, la retoma
 * después de comer— todavía tiene que encontrarla. Recién cuando pasó un día
 * entero deja de ser una compra a medias y pasa a ser una fila abandonada.
 */
export const ONRAMP_ABANDON_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * La compra que esa wallet dejó a medias, para volver a mostrarla.
 *
 * El vencimiento se calcula acá y no se guarda: nadie corre un job que marque
 * vencidas las compras, así que el estado en la tabla se queda en `pending` para
 * siempre. Ya pagada (`paid`) el vencimiento del QR no significa nada — el
 * proveedor está acreditando y hay que seguir esperando.
 *
 * Leer es además el único momento en que alguien mira estas filas, así que es
 * acá donde se cierra la que venció hace tanto que ya nadie va a volver por
 * ella. Sin esto queda `pending` para siempre y le tapa la pantalla a la compra
 * siguiente.
 */
export async function findPendingOnrampPurchase(
  repository: OnrampPurchaseRepository,
  walletAddress: string,
  now: Date = new Date(),
): Promise<PendingOnrampPurchase> {
  const purchase = await repository.findOpenForWallet(walletAddress);
  if (!purchase) return { state: 'none' };

  const ranOut = purchase.status === 'pending' && !!purchase.expiresAt && purchase.expiresAt.getTime() <= now.getTime();
  if (!ranOut) return { state: 'pending', purchase };

  if (now.getTime() - purchase.expiresAt!.getTime() > ONRAMP_ABANDON_GRACE_MS) {
    try {
      await markOnrampPurchaseTerminal(repository, { walletAddress, id: purchase.id, status: 'expired' });
      return { state: 'none' };
    } catch {
      // No poder cerrarla no puede romper la lectura: sigue abierta, así que se
      // devuelve como lo que es y se vuelve a intentar en la próxima.
    }
  }

  return { state: 'expired', purchase };
}

export interface MarkOnrampPurchaseTerminalInput {
  /** Siempre la de la sesión: nadie puede terminar la compra de otro. */
  walletAddress: string;
  id: string;
  status: Extract<OnrampPurchaseStatus, 'settled' | 'expired' | 'failed' | 'cancelled'>;
  errorReason?: string | null;
}

/**
 * Cierra una compra. Idempotente a propósito: el poller del modal y el usuario
 * volviendo a la pantalla pueden llegar los dos, y el segundo no puede convertir
 * una compra ya acreditada en una fallida. El primer desenlace es el que vale.
 *
 * Devuelve null si la compra no existe o no es de esa wallet, que para el que
 * llama es lo mismo: no hay nada que pueda tocar.
 */
export async function markOnrampPurchaseTerminal(
  repository: OnrampPurchaseRepository,
  input: MarkOnrampPurchaseTerminalInput,
): Promise<OnrampPurchaseRecord | null> {
  const current = await repository.getById(input.id);
  if (!current || current.walletAddress !== input.walletAddress) return null;
  if (TERMINAL_ONRAMP_STATUSES.includes(current.status)) return current;

  return repository.update(input.id, {
    status: input.status,
    errorReason: input.errorReason ?? null,
  });
}
