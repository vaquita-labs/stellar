import { describe, expect, it } from 'vitest';
import { isKycRequiredError, kycNeededBy, waitForKycApproval } from './kycWait';

describe('waitForKycApproval', () => {
  it('termina apenas el proveedor dice que aprobó', async () => {
    const outcome = await waitForKycApproval({
      readStatus: async () => ({ hasApproved: true }),
      sleep: async () => {},
    });

    expect(outcome).toBe('approved');
  });

  it('sigue preguntando mientras el proveedor no aprueba', async () => {
    const answers = [false, false, true];
    let reads = 0;

    const outcome = await waitForKycApproval({
      readStatus: async () => ({ hasApproved: answers[reads++] }),
      sleep: async () => {},
    });

    expect(outcome).toBe('approved');
    expect(reads).toBe(3);
  });

  it('no da por terminada la espera porque una consulta falle', async () => {
    // El proveedor todavía no conoce al usuario: contesta con error hasta que lo
    // registra. Cortar acá dejaría al usuario esperando una aprobación que sí
    // iba a llegar.
    let reads = 0;

    const outcome = await waitForKycApproval({
      readStatus: async () => {
        reads += 1;
        if (reads < 3) throw new Error('404');
        return { hasApproved: true };
      },
      sleep: async () => {},
    });

    expect(outcome).toBe('approved');
    expect(reads).toBe(3);
  });

  it('deja de preguntar cuando se cierra la pantalla', async () => {
    let open = true;
    let reads = 0;

    const outcome = await waitForKycApproval({
      readStatus: async () => {
        reads += 1;
        open = false;
        return { hasApproved: false };
      },
      shouldStop: () => !open,
      sleep: async () => {},
    });

    expect(outcome).toBe('cancelled');
    expect(reads).toBe(1);
  });

  it('se rinde cuando la verificación tarda más de lo que vale esperar', async () => {
    // La pantalla no puede quedarse preguntando para siempre: pasado el límite
    // el usuario merece que se lo digan en vez de mirar un cartel eterno.
    let clock = 0;

    const outcome = await waitForKycApproval({
      readStatus: async () => ({ hasApproved: false }),
      timeoutMs: 1000,
      sleep: async () => {
        clock += 400;
      },
      now: () => clock,
    });

    expect(outcome).toBe('timeout');
  });
});

describe('kycNeededBy', () => {
  it('reconoce una compra frenada por verificación y se queda con el link', () => {
    expect(kycNeededBy({ kycRequired: true, kycUrl: 'https://kyc.example/abc' })).toEqual({
      url: 'https://kyc.example/abc',
    });
  });

  it('la reconoce igual cuando el proveedor no publica link', () => {
    expect(kycNeededBy({ kycRequired: true })).toEqual({ url: null });
  });

  it('no frena una compra que trae sus instrucciones de pago', () => {
    expect(kycNeededBy({})).toBeNull();
  });
});

describe('isKycRequiredError', () => {
  it('reconoce el rechazo por verificación pendiente', () => {
    // Pollar puede contestar la misma situación con un 200 o con un error; las
    // dos formas tienen que llevar al usuario a la misma pantalla.
    expect(isKycRequiredError(Object.assign(new Error('KYC'), { code: 'SDK_RAMPS_KYC_REQUIRED' }))).toBe(true);
  });

  it('no confunde cualquier otro fallo con una verificación pendiente', () => {
    expect(isKycRequiredError(Object.assign(new Error('nope'), { code: 'SDK_RAMPS_QUOTE_EXPIRED' }))).toBe(false);
    expect(isKycRequiredError(new Error('boom'))).toBe(false);
    expect(isKycRequiredError(null)).toBe(false);
  });
});
