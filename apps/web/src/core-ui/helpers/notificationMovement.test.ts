import { describe, expect, it } from 'vitest';
import { notificationMovementId } from './notificationMovement';
import type { AppTransaction } from './transactions';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 4, 12);

const tx = (over: Partial<AppTransaction> & Pick<AppTransaction, 'id' | 'kind' | 'timestamp'>): AppTransaction => ({
  depositId: 1,
  nonce: null,
  status: 'completed',
  early: false,
  amount: 1,
  interest: 0,
  tokenSymbol: 'USDC',
  lockPeriod: 30 * DAY,
  transactionHash: '',
  history: [],
  ...over,
});

const move = (id: string, confirmedAt: number, over: Partial<AppTransaction> = {}) =>
  tx({
    id,
    kind: 'move',
    timestamp: confirmedAt - 60_000,
    history: [
      { key: 'moveRequested', timestamp: confirmedAt - 60_000 },
      { key: 'moveConfirmed', timestamp: confirmedAt },
    ],
    ...over,
  });

const withdraw = (id: string, confirmedAt: number, over: Partial<AppTransaction> = {}) =>
  tx({
    id,
    kind: 'withdraw',
    timestamp: confirmedAt - 60_000,
    history: [
      { key: 'withdrawRequested', timestamp: confirmedAt - 60_000 },
      { key: 'withdrawConfirmed', timestamp: confirmedAt },
    ],
    ...over,
  });

const notification = (messageKey: string, createdAt: number, amount = '1.00') => ({
  messageKey,
  params: { amount },
  createdAt,
});

describe('notificationMovementId', () => {
  it('un depósito confirmado abre el traspaso confirmado en ese momento', () => {
    const transactions = [move('d-1', T0 - 40 * DAY), move('d-2', T0), withdraw('w-1-9', T0 + 1000)];
    expect(notificationMovementId(notification('depositConfirmed', T0 + 500), transactions)).toBe('d-2');
  });

  it('un retiro completado abre el retiro, no el traspaso de la misma posición', () => {
    const transactions = [move('d-1', T0 - 40 * DAY), withdraw('w-1-9', T0), withdraw('w-2-10', T0 + 20 * DAY)];
    expect(notificationMovementId(notification('withdrawalCompleted', T0 + 500), transactions)).toBe('w-1-9');
  });

  it('entre dos movimientos del mismo momento prefiere el del mismo monto', () => {
    const transactions = [move('d-1', T0, { amount: 5 }), move('d-2', T0 + 2000, { amount: 1 })];
    expect(notificationMovementId(notification('depositConfirmed', T0 + 100, '1.00'), transactions)).toBe('d-2');
  });

  it('no adivina: sin un movimiento de ese día, no hay detalle', () => {
    const transactions = [move('d-1', T0 - 40 * DAY), withdraw('w-1-9', T0 - 5 * DAY)];
    expect(notificationMovementId(notification('depositConfirmed', T0), transactions)).toBeNull();
    expect(notificationMovementId(notification('withdrawalCompleted', T0), transactions)).toBeNull();
  });

  it('ignora movimientos pendientes o fallidos', () => {
    const transactions = [move('d-1', T0, { status: 'failed' }), withdraw('w-1-9', T0, { status: 'pending' })];
    expect(notificationMovementId(notification('depositConfirmed', T0), transactions)).toBeNull();
    expect(notificationMovementId(notification('withdrawalCompleted', T0), transactions)).toBeNull();
  });

  it('un desbloqueo abre la posición que se liberó última antes del aviso', () => {
    const transactions = [move('d-1', T0 - 90 * DAY), move('d-2', T0 - 31 * DAY), move('d-3', T0 - 10 * DAY)];
    // d-3 sigue bloqueada; d-2 se liberó ayer y el aviso salió al leer el feed hoy.
    expect(notificationMovementId(notification('depositUnlocked', T0), transactions)).toBe('d-2');
  });

  it('no toca las notificaciones que no son de plata', () => {
    expect(notificationMovementId(notification('newFollower', T0), [move('d-1', T0)])).toBeNull();
  });
});
