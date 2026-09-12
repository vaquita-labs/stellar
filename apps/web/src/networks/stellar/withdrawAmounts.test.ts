import { describe, expect, it } from 'vitest';
import { toBaseUnits } from './sorobanTx';
import { payableAmount, WITHDRAW_DUST_STR, withdrawRequestAmount } from './withdrawAmounts';

const USDC_DECIMALS = 7;
/** One stroop: the smallest USDC amount the chain can represent. */
const STROOP = 1n;
const usdc = (human: string) => toBaseUnits(human, USDC_DECIMALS);

describe('withdrawRequestAmount', () => {
  it('adds the margin when a payment leg follows', () => {
    expect(withdrawRequestAmount('1', USDC_DECIMALS, { hasPaymentLeg: true })).toBe('1.0001000');
  });

  it('asks for exactly the typed amount when the wallet is the destination', () => {
    expect(withdrawRequestAmount('1', USDC_DECIMALS, { hasPaymentLeg: false })).toBe('1');
  });

  // El margen es plata del usuario saliendo del ahorro: tiene que ser el que
  // dice la constante, no uno que se coló por un float en el medio.
  it('adds exactly the declared margin, with no float in between', () => {
    const padded = withdrawRequestAmount('0.1', USDC_DECIMALS, { hasPaymentLeg: true });

    expect(usdc(padded) - usdc('0.1')).toBe(usdc(WITHDRAW_DUST_STR));
  });
});

describe('payableAmount', () => {
  // El caso que originó todo: se pidió 1 USDC y el vault acreditó un stroop
  // menos. Pagar el pedido rebota con `op_underfunded` y deja la plata en la
  // wallet con el retiro ya hecho.
  it('sends the credit when it lands short of the requested amount', () => {
    expect(payableAmount(usdc('1') - STROOP, '1', USDC_DECIMALS, { withdrawAll: false })).toBe('0.9999999');
  });

  // Lo que deja el margen: entró de más, y el destino cobra el número redondo.
  it('sends the requested figure when the credit covers it', () => {
    expect(payableAmount(usdc('1.0001'), '1', USDC_DECIMALS, { withdrawAll: false })).toBe('1.0000000');
  });

  it('sends the requested figure when the credit matches it exactly', () => {
    expect(payableAmount(usdc('1'), '1', USDC_DECIMALS, { withdrawAll: false })).toBe('1.0000000');
  });

  // Retirar TODO saca la posición entera, que con los intereses del último
  // bloque es más que el monto tecleado. Ahí se manda lo que llegó, no lo
  // pedido, o quedaría polvo rindiendo en un ahorro que el usuario cerró.
  it('sends the whole credit on a full withdrawal, even above the typed amount', () => {
    expect(payableAmount(usdc('1.00042'), '1', USDC_DECIMALS, { withdrawAll: true })).toBe('1.0004200');
  });

  it('sends the whole credit on a full withdrawal that came up short', () => {
    expect(payableAmount(usdc('1') - STROOP, '1', USDC_DECIMALS, { withdrawAll: true })).toBe('0.9999999');
  });

  // Una posición vaciada se clampea al saldo de shares y acredita bastante menos
  // de lo pedido: el piso tiene que aguantar eso igual que un stroop.
  it('survives a credit far below the request, not just one stroop', () => {
    expect(payableAmount(usdc('0.5'), '1', USDC_DECIMALS, { withdrawAll: false })).toBe('0.5000000');
  });
});

describe('the two together', () => {
  const requested = '1';
  const asked = () => usdc(withdrawRequestAmount(requested, USDC_DECIMALS, { hasPaymentLeg: true }));

  // La invariante que cierra el incidente: con el margen puesto, cualquier
  // truncamiento de hasta el margen entero sigue pagando el número redondo.
  it('pays the round figure for any shortfall the margin covers', () => {
    for (const shortfall of [0n, STROOP, 2n, 10n, 999n, usdc(WITHDRAW_DUST_STR)]) {
      expect(payableAmount(asked() - shortfall, requested, USDC_DECIMALS, { withdrawAll: false })).toBe('1.0000000');
    }
  });

  it('still pays, just less, once the shortfall exceeds the margin', () => {
    const credited = asked() - usdc(WITHDRAW_DUST_STR) - STROOP;

    expect(payableAmount(credited, requested, USDC_DECIMALS, { withdrawAll: false })).toBe('0.9999999');
  });
});
