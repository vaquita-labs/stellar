import { describe, expect, it } from 'vitest';
import { cosignSheetAction } from './CosignHost';

describe('cosignSheetAction', () => {
  it('abre la hoja si el pedido ya estaba pendiente al montar', () => {
    expect(cosignSheetAction(null, 1)).toBe('open');
  });

  it('no abre la hoja en el primer vistazo cuando no hay pedidos', () => {
    expect(cosignSheetAction(null, 0)).toBe('stay');
  });

  it('abre la hoja solo cuando llega un pedido nuevo', () => {
    expect(cosignSheetAction(0, 1)).toBe('open');
    expect(cosignSheetAction(1, 1)).toBe('stay');
  });

  it('cierra la hoja cuando ya no queda nada por aprobar', () => {
    expect(cosignSheetAction(1, 0)).toBe('close');
  });
});
