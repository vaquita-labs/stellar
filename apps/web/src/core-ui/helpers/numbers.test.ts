import { describe, expect, it } from 'vitest';
import { toBaseUnits } from '@/networks/stellar/sorobanTx';
import {
  floorAmount,
  formatTokenAdaptive,
  formatTokenPrecise,
  formatUsdPrecise,
  MIN_USDC,
  MIN_USDC_STR,
  truncatedAmountString,
} from './numbers';

describe('floorAmount', () => {
  // La regresión que motivó todo esto: un saldo de 0,7299999 en la cuenta se
  // mostraba como "$0,73" (redondeo hacia arriba), o sea más plata de la que el
  // usuario tenía, y el botón prometía invertir un monto inexistente.
  it('pisa hacia abajo y nunca hacia arriba', () => {
    expect(floorAmount(0.7299999, 2)).toBe(0.72);
  });

  // El epsilon existe para el ruido binario: 0.29 * 1e7 da 2899999.999… y un
  // truncado pelado lo bajaría un dígito. Estos dos casos son los que ese
  // epsilon protege — si alguien lo saca, se rompen acá y no en producción.
  it('no se come el último decimal por ruido de float', () => {
    expect(floorAmount(0.29, 7)).toBe(0.29);
    expect(floorAmount(5.9999995, 7)).toBe(5.9999995);
  });

  it('devuelve 0 para valores no finitos', () => {
    expect(floorAmount(Number.NaN)).toBe(0);
    expect(floorAmount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(floorAmount(0)).toBe(0);
  });
});

describe('formatUsdPrecise / formatTokenPrecise', () => {
  it('pisa a los decimales pedidos', () => {
    expect(formatUsdPrecise(0.7299999, 2)).toBe('$0.72');
    expect(formatTokenPrecise(0.7299999, 2)).toBe('0.72');
  });

  it('mantiene siempre dos decimales como mínimo', () => {
    expect(formatTokenPrecise(0.1, 2)).toBe('0.10');
    expect(formatTokenPrecise(4, 2)).toBe('4.00');
  });
});

describe('formatTokenAdaptive', () => {
  it('recorta a 2 decimales arriba de 100 y conserva la precisión abajo', () => {
    expect(formatTokenAdaptive(722.0121232)).toBe('722.01');
    expect(formatTokenAdaptive(10.4699999)).toBe('10.4699999');
  });
});

describe('truncatedAmountString', () => {
  it('deja el string limpio para prellenar el teclado', () => {
    expect(truncatedAmountString(3.001234)).toBe('3.001234');
    expect(truncatedAmountString(4)).toBe('4');
    expect(truncatedAmountString(0.7299999)).toBe('0.7299999');
  });
});

describe('MIN_USDC', () => {
  // apps/web no depende de @vaquita/shared —las constantes están espejadas a
  // mano—, así que acá se clava el valor y del otro lado se clava el mismo. El
  // que cambie uno solo rompe el test del lado que tocó y ve el comentario.
  // El backend es la autoridad: `MIN_USDC_AMOUNT` en packages/shared.
  it('vale 0,1 USDC, el mismo piso que valida el backend', () => {
    expect(MIN_USDC).toBe(0.1);
  });

  // El gate de ejecución compara en unidades base, y para eso necesita el
  // string exacto. `String(0.1)` hoy da '0.1', pero derivar el número del
  // string y no al revés es lo que garantiza que sigan siendo el mismo valor.
  it('deriva el número del string y no al revés', () => {
    expect(Number(MIN_USDC_STR)).toBe(MIN_USDC);
    expect(toBaseUnits(MIN_USDC_STR, 7)).toBe(1_000_000n);
  });

  // Los pisos reales medidos sobre mainnet el 2026-09-02: ~0,000001 USDC en el
  // vault de DeFindex, ~0,0001 en Blend. El mínimo de la app tiene que quedar
  // por encima de los dos o el depósito se acepta en pantalla y falla en cadena.
  it('queda por encima del piso de polvo de la cadena', () => {
    expect(MIN_USDC).toBeGreaterThan(0.0001);
    expect(formatUsdPrecise(MIN_USDC, 2)).toBe('$0.10');
  });
});
