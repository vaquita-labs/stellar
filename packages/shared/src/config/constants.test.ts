import { describe, expect, it } from 'vitest';
import { depositSchema } from '../schemas/deposit';
import { MIN_USDC_AMOUNT } from './constants';

describe('MIN_USDC_AMOUNT', () => {
  // apps/web no depende de este paquete: espeja la constante a mano como
  // `MIN_USDC` en apps/web/src/core-ui/helpers/numbers.ts, y el front la usa
  // para apagar el botón antes de que el request llegue. Clavar el valor en los
  // dos lados hace que quien cambie uno rompa su propio test y lea el comentario
  // que lo manda a cambiar el otro.
  it('vale 0,1 USDC, el mismo piso que muestra el front', () => {
    expect(MIN_USDC_AMOUNT).toBe(0.1);
  });

  // Estaba en 1 y la app tenía cuatro mínimos distintos según por dónde
  // entraras. Los pisos reales de la cadena, medidos sobre mainnet el
  // 2026-09-02, son ~0,000001 USDC en el vault de DeFindex y ~0,0001 en Blend:
  // el mínimo de la app tiene que quedar arriba de los dos o el depósito se
  // acepta en pantalla y falla en cadena.
  it('queda por encima del piso de polvo de la cadena', () => {
    expect(MIN_USDC_AMOUNT).toBeGreaterThan(0.0001);
  });

  it('es el piso que rechaza el schema de depósito', () => {
    const deposit = {
      networkName: 'mainnet',
      walletAddress: 'GABC',
      tokenSymbol: 'USDC',
      lockPeriod: 30,
      vaquitaContract: 'CABC',
    };
    expect(depositSchema.safeParse({ ...deposit, amount: 0.09 }).success).toBe(false);
    expect(depositSchema.safeParse({ ...deposit, amount: MIN_USDC_AMOUNT }).success).toBe(true);
  });
});
