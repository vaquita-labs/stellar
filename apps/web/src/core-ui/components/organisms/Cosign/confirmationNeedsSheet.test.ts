import { describe, expect, it } from 'vitest';
import { confirmationNeedsSheet } from './ConfirmHost';

describe('confirmationNeedsSheet', () => {
  it('no muestra la hoja para una firma de un flujo propio', () => {
    expect(confirmationNeedsSheet(0)).toBe(false);
  });

  it('muestra la hoja mientras se firma un tramo de ramp', () => {
    expect(confirmationNeedsSheet(1)).toBe(true);
  });

  it('muestra la hoja si el contador del SDK no se puede leer', () => {
    expect(confirmationNeedsSheet(undefined)).toBe(true);
  });
});
