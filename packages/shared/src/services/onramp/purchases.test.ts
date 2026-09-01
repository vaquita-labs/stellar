import { describe, expect, it } from 'vitest';
import {
  findPendingOnrampPurchase,
  markOnrampPurchaseTerminal,
  ONRAMP_ABANDON_GRACE_MS,
  recordOnrampPurchase,
  type OnrampPurchaseRecord,
  type OnrampPurchaseRepository,
} from './purchases';

/** Fake en memoria: el servicio se prueba entero sin base de datos. */
class MemoryOnrampPurchaseRepository implements OnrampPurchaseRepository {
  private rows = new Map<string, OnrampPurchaseRecord>();
  private nextId = 1;

  async create(input: Omit<OnrampPurchaseRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date('2026-08-26T12:00:00.000Z');
    const row = { ...input, id: String(this.nextId++), createdAt: now, updatedAt: now };
    this.rows.set(row.id, row);
    return row;
  }

  async getById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findOpenForWallet(walletAddress: string) {
    return (
      [...this.rows.values()]
        .filter((row) => row.walletAddress === walletAddress && ['pending', 'paid'].includes(row.status))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
    );
  }

  async update(id: string, patch: Partial<OnrampPurchaseRecord>) {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Missing row ${id}`);
    const updated = { ...row, ...patch, id, updatedAt: new Date('2026-08-26T12:05:00.000Z') };
    this.rows.set(id, updated);
    return updated;
  }
}

const PURCHASE = {
  walletAddress: 'GABC',
  providerTxId: 'tx-1',
  provider: 'stereum',
  country: 'BO',
  amountFiat: '350',
  currency: 'BOB',
};

describe('recordOnrampPurchase', () => {
  it('remembers a purchase so the wallet can get its payment screen back', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, PURCHASE);

    const found = await findPendingOnrampPurchase(repo, 'GABC');
    expect(found.state).toBe('pending');
    expect(found.state === 'pending' && found.purchase.providerTxId).toBe('tx-1');
  });
});

describe('findPendingOnrampPurchase', () => {
  it('yields nothing for a wallet that has no purchase in flight', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    expect(await findPendingOnrampPurchase(repo, 'GABC')).toEqual({ state: 'none' });
  });

  it('never hands one wallet another wallet\'s purchase', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, PURCHASE);

    expect(await findPendingOnrampPurchase(repo, 'GXYZ')).toEqual({ state: 'none' });
  });
});

describe('markOnrampPurchaseTerminal', () => {
  it('takes a finished purchase out of the way of the next one', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    const purchase = await recordOnrampPurchase(repo, PURCHASE);

    await markOnrampPurchaseTerminal(repo, { walletAddress: 'GABC', id: purchase.id, status: 'settled' });

    expect(await findPendingOnrampPurchase(repo, 'GABC')).toEqual({ state: 'none' });
  });

  it('keeps the first outcome when the same purchase is settled twice', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    const purchase = await recordOnrampPurchase(repo, PURCHASE);
    const args = { walletAddress: 'GABC', id: purchase.id } as const;

    const first = await markOnrampPurchaseTerminal(repo, { ...args, status: 'settled' });
    // El poller y el usuario volviendo a la pantalla pueden llegar a la vez; el
    // segundo no puede convertir una compra acreditada en una fallida.
    const second = await markOnrampPurchaseTerminal(repo, { ...args, status: 'failed', errorReason: 'late' });

    expect(first?.status).toBe('settled');
    expect(second?.status).toBe('settled');
    expect(second?.errorReason).toBeNull();
  });

  it('frees the wallet when the user cancels a code that had not run out yet', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    // Vence recién en media hora: el usuario la abandona teniendo código vivo.
    const purchase = await recordOnrampPurchase(repo, {
      ...PURCHASE,
      expiresAt: new Date('2026-08-26T12:30:00.000Z'),
    });

    const closed = await markOnrampPurchaseTerminal(repo, {
      walletAddress: 'GABC',
      id: purchase.id,
      status: 'cancelled',
    });

    // Cancelada queda registrada como tal —no como vencida— y deja de tapar la
    // pantalla, que es todo el punto de poder cancelar.
    expect(closed?.status).toBe('cancelled');
    expect((await findPendingOnrampPurchase(repo, 'GABC', new Date('2026-08-26T12:10:00.000Z'))).state).toBe('none');
  });

  it('will not reopen a cancelled purchase to call it expired later', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    const purchase = await recordOnrampPurchase(repo, PURCHASE);
    const args = { walletAddress: 'GABC', id: purchase.id } as const;

    await markOnrampPurchaseTerminal(repo, { ...args, status: 'cancelled' });
    const second = await markOnrampPurchaseTerminal(repo, { ...args, status: 'expired' });

    expect(second?.status).toBe('cancelled');
  });

  it('refuses to finish a purchase that belongs to another wallet', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    const purchase = await recordOnrampPurchase(repo, PURCHASE);

    expect(
      await markOnrampPurchaseTerminal(repo, { walletAddress: 'GXYZ', id: purchase.id, status: 'failed' }),
    ).toBeNull();
    expect((await findPendingOnrampPurchase(repo, 'GABC')).state).toBe('pending');
  });
});

describe('an unpaid purchase whose QR ran out', () => {
  const NOW = new Date('2026-08-26T13:00:00.000Z');

  it('comes back as expired, which is not the same as failed', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, { ...PURCHASE, expiresAt: new Date('2026-08-26T12:30:00.000Z') });

    const found = await findPendingOnrampPurchase(repo, 'GABC', NOW);

    // Vencida sigue siendo recuperable en pantalla ("volvé a empezar"); fallida
    // ya terminó y no vuelve nunca.
    expect(found.state).toBe('expired');
    expect(found.state === 'expired' && found.purchase.providerTxId).toBe('tx-1');
  });

  it('is still pending while its expiry is in the future', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, { ...PURCHASE, expiresAt: new Date('2026-08-26T13:30:00.000Z') });

    expect((await findPendingOnrampPurchase(repo, 'GABC', NOW)).state).toBe('pending');
  });

  it('stays pending once paid, even past the expiry the QR carried', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    const purchase = await recordOnrampPurchase(repo, {
      ...PURCHASE,
      expiresAt: new Date('2026-08-26T12:30:00.000Z'),
    });
    // Pagó dentro de tiempo y el proveedor todavía está acreditando: el
    // vencimiento del QR ya no significa nada.
    await repo.update(purchase.id, { status: 'paid' });

    expect((await findPendingOnrampPurchase(repo, 'GABC', NOW)).state).toBe('pending');
  });
});

describe('a purchase nobody came back for', () => {
  const EXPIRED_AT = new Date('2026-08-26T12:30:00.000Z');
  /** Bastante después del vencimiento como para no ser alguien que sigue mirando. */
  const MUCH_LATER = new Date('2026-08-28T12:30:00.000Z');

  it('stops being offered once it has been expired for far too long', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, { ...PURCHASE, expiresAt: EXPIRED_AT });

    expect((await findPendingOnrampPurchase(repo, 'GABC', MUCH_LATER)).state).toBe('none');
    // Y sigue sin ofrecerse: el cierre quedó guardado, no fue sólo esta lectura.
    expect((await findPendingOnrampPurchase(repo, 'GABC', MUCH_LATER)).state).toBe('none');
  });

  it('is still offered while it is only just expired', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, { ...PURCHASE, expiresAt: EXPIRED_AT });

    // El usuario que vuelve al rato tiene que encontrar su compra, no una
    // pantalla en blanco: acá todavía se le ofrece.
    const soonAfter = new Date(EXPIRED_AT.getTime() + ONRAMP_ABANDON_GRACE_MS);
    expect((await findPendingOnrampPurchase(repo, 'GABC', soonAfter)).state).toBe('expired');
  });

  it('is never closed by the clock once the provider took the payment', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    const purchase = await recordOnrampPurchase(repo, { ...PURCHASE, expiresAt: EXPIRED_AT });
    await repo.update(purchase.id, { status: 'paid' });

    // Pagada y acreditándose: el vencimiento del QR ya no dice nada, y cerrarla
    // dejaría al usuario sin pantalla con la plata en el aire.
    expect((await findPendingOnrampPurchase(repo, 'GABC', MUCH_LATER)).state).toBe('pending');
  });

  it('is never closed when the provider published no expiry at all', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, PURCHASE);

    // Inventarle una vida al código mataría uno que el banco habría aceptado.
    expect((await findPendingOnrampPurchase(repo, 'GABC', MUCH_LATER)).state).toBe('pending');
  });

  it('is still handed back when the close itself fails', async () => {
    const repo = new MemoryOnrampPurchaseRepository();
    await recordOnrampPurchase(repo, { ...PURCHASE, expiresAt: EXPIRED_AT });
    repo.update = async () => {
      throw new Error('database is down');
    };

    // No poder cerrarla no puede romper la lectura: la compra sigue abierta, así
    // que decir que sigue abierta es lo honesto.
    expect((await findPendingOnrampPurchase(repo, 'GABC', MUCH_LATER)).state).toBe('expired');
  });
});
