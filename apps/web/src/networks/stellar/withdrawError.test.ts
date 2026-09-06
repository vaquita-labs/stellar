import { describe, expect, it } from 'vitest';
import { humanizeTxError } from '@/core-ui/helpers/txError';
import { isWithdrawPaymentError, WithdrawPaymentError } from './withdrawError';

describe('WithdrawPaymentError', () => {
  it('names the destination that was not paid', () => {
    const error = new WithdrawPaymentError('@vecina', new Error('op_no_trust'));

    expect(error.destination).toBe('@vecina');
    expect(error.message).toContain('@vecina');
    expect(isWithdrawPaymentError(error)).toBe(true);
  });

  it('keeps the original failure for logs without showing it', () => {
    const cause = new Error('tx failed: op_underfunded');
    const error = new WithdrawPaymentError('@vecina', cause);

    expect(error.raw).toBe('tx failed: op_underfunded');
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain('op_underfunded');
  });

  it('is not confused with an ordinary error', () => {
    expect(isWithdrawPaymentError(new Error('op_no_trust'))).toBe(false);
    expect(isWithdrawPaymentError(null)).toBe(false);
  });
});

describe('humanizeTxError on a half-done withdraw', () => {
  // Lo que importa: el salto 1 YA movió la plata. Un mensaje que diga "no
  // pudimos completar la transacción" haría pensar que sigue invertida, y el
  // usuario esperaría un saldo que ya no está donde cree.
  it('says the money moved instead of reporting a failed transaction', () => {
    const result = humanizeTxError(new WithdrawPaymentError('@vecina', new Error('op_no_trust')));

    expect(result.title).toContain('in your wallet');
    expect(result.title).toContain('@vecina');
    expect(result.title).not.toContain("couldn't complete the transaction");
  });

  it('points at the screen that retries the payment', () => {
    const result = humanizeTxError(new WithdrawPaymentError('@vecina', new Error('boom')));

    expect(result.title).toContain('Send');
  });

  it('is not treated as pending: the withdraw leg is settled, not in flight', () => {
    const result = humanizeTxError(new WithdrawPaymentError('@vecina', new Error('boom')));

    expect(result.pending).toBeFalsy();
  });

  // El error del pago suele traer un `Error(Contract, #13)` adentro, que la
  // escalera de regex leería como "tu wallet tiene que habilitar USDC": cierto
  // para el destino, y exactamente al revés para quien está mirando la pantalla.
  it('wins over the contract-code ladder that would blame the sender', () => {
    const result = humanizeTxError(new WithdrawPaymentError('@vecina', new Error('Error(Contract, #13)')));

    expect(result.title).toContain('in your wallet');
    expect(result.title).not.toContain('Add the USDC trustline');
  });
});
