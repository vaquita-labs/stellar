import { describe, expect, it } from 'vitest';
import {
  advanceOfframpWithdrawal,
  findOpenOfframpWithdrawal,
  markOfframpWithdrawalTerminal,
  OFFRAMP_ABANDON_GRACE_MS,
  startOfframpWithdrawal,
  type OfframpWithdrawalRecord,
  type OfframpWithdrawalRepository,
} from './withdrawals';

// El repo fake sella todas las filas con esta fecha, así que TODA lectura tiene
// que pasarla como `now`. Con el reloj real, `findOpenOfframpWithdrawal` mide la
// distancia contra hoy y a las 24 horas de escrito el test empieza a dar
// `abandoned` para filas que el test acaba de crear: los tres asserts que la
// omitían pasaron el 29 de agosto y venían fallando desde el 30.
const START = new Date('2026-08-29T12:00:00.000Z');

/** Fake en memoria: el servicio se prueba entero sin base de datos. */
class MemoryOfframpWithdrawalRepository implements OfframpWithdrawalRepository {
  private rows = new Map<string, OfframpWithdrawalRecord>();
  private nextId = 1;
  /** Lo controla el test para poder envejecer una fila sin esperar un día. */
  touchedAt = START;

  async create(input: Omit<OfframpWithdrawalRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const row = { ...input, id: String(this.nextId++), createdAt: this.touchedAt, updatedAt: this.touchedAt };
    this.rows.set(row.id, row);
    return row;
  }

  async getById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async findOpenForWallet(walletAddress: string) {
    return (
      [...this.rows.values()]
        .filter((row) => row.walletAddress === walletAddress && row.status === 'pending')
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
    );
  }

  async update(id: string, patch: Partial<OfframpWithdrawalRecord>) {
    const row = this.rows.get(id);
    if (!row) throw new Error(`Missing row ${id}`);
    const updated = { ...row, ...patch, id, updatedAt: this.touchedAt };
    this.rows.set(id, updated);
    return updated;
  }
}

const WITHDRAWAL = {
  walletAddress: 'GABC',
  country: 'BO',
  amountFiat: '350',
  currency: 'BOB',
  provider: 'abroad',
  rail: 'ACH',
};

describe('startOfframpWithdrawal', () => {
  it('opens the row before the provider exists, so a withdrawal that never reaches the ramp still leaves a trace', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);

    // Ni id de proveedor ni hashes: es una fila abierta antes de tocar el vault.
    expect(started.providerTxId).toBeNull();
    expect(started.vaultWithdrawHash).toBeNull();
    expect(started.step).toBe('funds');
    expect(started.status).toBe('pending');
  });
});

describe('advanceOfframpWithdrawal', () => {
  it('records how far the withdrawal got', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);

    await advanceOfframpWithdrawal(repo, {
      walletAddress: 'GABC',
      id: started.id,
      step: 'create',
      vaultWithdrawHash: 'hash-vault',
      usdcAmount: '50.1',
    });
    const found = await findOpenOfframpWithdrawal(repo, 'GABC', START);

    expect(found?.step).toBe('create');
    expect(found?.vaultWithdrawHash).toBe('hash-vault');
  });

  it('keeps what earlier steps recorded when a later step omits it', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);
    const args = { walletAddress: 'GABC', id: started.id } as const;

    await advanceOfframpWithdrawal(repo, { ...args, step: 'create', vaultWithdrawHash: 'hash-vault' });
    // El paso del pago no sabe nada del hash del vault: no puede borrarlo.
    await advanceOfframpWithdrawal(repo, { ...args, step: 'payout', paymentHash: 'hash-pay' });

    const found = await findOpenOfframpWithdrawal(repo, 'GABC', START);
    expect(found?.vaultWithdrawHash).toBe('hash-vault');
    expect(found?.paymentHash).toBe('hash-pay');
  });

  it('never lets one wallet touch another wallet\'s withdrawal', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);

    expect(await advanceOfframpWithdrawal(repo, { walletAddress: 'GXYZ', id: started.id, step: 'payout' })).toBeNull();
    expect((await findOpenOfframpWithdrawal(repo, 'GABC', START))?.step).toBe('funds');
  });

  it('cannot reopen a withdrawal that already finished', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);
    const args = { walletAddress: 'GABC', id: started.id } as const;

    await markOfframpWithdrawalTerminal(repo, { ...args, status: 'settled' });
    const late = await advanceOfframpWithdrawal(repo, { ...args, step: 'funds' });

    expect(late?.status).toBe('settled');
    expect(late?.step).toBe('funds');
  });
});

describe('findOpenOfframpWithdrawal', () => {
  it('yields nothing for a wallet with nothing in flight', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    expect(await findOpenOfframpWithdrawal(repo, 'GABC', START)).toBeNull();
  });

  it('never hands one wallet another wallet\'s withdrawal', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    await startOfframpWithdrawal(repo, WITHDRAWAL);

    expect(await findOpenOfframpWithdrawal(repo, 'GXYZ', START)).toBeNull();
  });

  it('gives up on a row nobody came back for, keeping it as the record of a failure', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);

    const later = new Date(START.getTime() + OFFRAMP_ABANDON_GRACE_MS + 1);
    expect(await findOpenOfframpWithdrawal(repo, 'GABC', later)).toBeNull();

    // Cerrada, no borrada: que haya quedado colgada es el dato que interesa.
    const row = await repo.getById(started.id);
    expect(row?.status).toBe('abandoned');
    expect(row?.step).toBe('funds');
  });

  it('still offers a withdrawal the user might come back to', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    await startOfframpWithdrawal(repo, WITHDRAWAL);

    // Una espera de KYC de horas sigue siendo un retiro en curso.
    const soon = new Date(START.getTime() + OFFRAMP_ABANDON_GRACE_MS - 1);
    expect(await findOpenOfframpWithdrawal(repo, 'GABC', soon)).not.toBeNull();
  });
});

describe('markOfframpWithdrawalTerminal', () => {
  it('takes a finished withdrawal out of the way of the next one', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);

    await markOfframpWithdrawalTerminal(repo, { walletAddress: 'GABC', id: started.id, status: 'settled' });

    expect(await findOpenOfframpWithdrawal(repo, 'GABC', START)).toBeNull();
  });

  it('keeps the first outcome when the same withdrawal is closed twice', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);
    const args = { walletAddress: 'GABC', id: started.id } as const;

    const first = await markOfframpWithdrawalTerminal(repo, { ...args, status: 'settled' });
    // El poller y el usuario volviendo pueden llegar los dos; el que llega tarde
    // no puede convertir un retiro acreditado en uno fallido.
    const second = await markOfframpWithdrawalTerminal(repo, { ...args, status: 'failed', errorReason: 'late' });

    expect(first?.status).toBe('settled');
    expect(second?.status).toBe('settled');
    expect(second?.errorReason).toBeNull();
  });

  it('records why a withdrawal failed', async () => {
    const repo = new MemoryOfframpWithdrawalRepository();
    const started = await startOfframpWithdrawal(repo, WITHDRAWAL);

    const failed = await markOfframpWithdrawalTerminal(repo, {
      walletAddress: 'GABC',
      id: started.id,
      status: 'failed',
      errorReason: 'provider never sent the payment',
    });

    expect(failed?.status).toBe('failed');
    expect(failed?.errorReason).toBe('provider never sent the payment');
  });
});
