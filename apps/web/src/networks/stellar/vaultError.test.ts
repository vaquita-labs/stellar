import { describe, expect, it } from 'vitest';
import { isVaultContractError, parseVaultError } from './vaultError';

describe('parseVaultError', () => {
  it('conserva el código, la key y el texto crudo', () => {
    const err = parseVaultError(new Error('HostError: ... Error(Contract, #451) ...'));
    expect(err).not.toBeNull();
    expect(err?.code).toBe(451);
    expect(err?.i18nKey).toBe('errors.vault.amountBelowMinDust');
    expect(err?.message).toBe('Amount is too small');
    // El crudo tiene que sobrevivir: es lo único que sirve para el "ver
    // detalles" y para buscar el error en la consola.
    expect(err?.raw).toContain('Error(Contract, #451)');
  });

  it('acepta un string pelado además de un Error', () => {
    expect(parseVaultError('Error(Contract, #412)')?.code).toBe(412);
  });

  it('devuelve null para códigos desconocidos y errores que no son de contrato', () => {
    expect(parseVaultError('Error(Contract, #999)')).toBeNull();
    expect(parseVaultError(new Error('network timeout'))).toBeNull();
    expect(parseVaultError(null)).toBeNull();
  });
});

describe('isVaultContractError', () => {
  it('distingue el error del vault de uno cualquiera', () => {
    expect(isVaultContractError(parseVaultError('Error(Contract, #451)'))).toBe(true);
    expect(isVaultContractError(new Error('Amount is too small'))).toBe(false);
  });
});
