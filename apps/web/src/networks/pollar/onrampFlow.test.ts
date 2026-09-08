import { describe, expect, it } from 'vitest';
import { receivedUsdcFrom, resumeActionFor, screenFor, shouldPoll, terminalStatusFor } from './onrampFlow';

const now = new Date('2026-08-27T12:00:00Z');
const soon = new Date('2026-08-27T12:05:00Z');
const past = new Date('2026-08-27T11:55:00Z');

describe('screenFor', () => {
  it('deja al usuario pagando mientras el proveedor no vio nada y el código sirve', () => {
    expect(screenFor({ providerStatus: 'pending', expiresAt: soon, now })).toBe('paying');
  });

  it('da el código por vencido cuando pasó la hora y el proveedor sigue esperando el pago', () => {
    expect(screenFor({ providerStatus: 'pending', expiresAt: past, now })).toBe('expired');
  });

  it('muestra la compra acreditada aunque el código haya vencido: el pago entró antes', () => {
    expect(screenFor({ providerStatus: 'completed', expiresAt: past, now })).toBe('settled');
  });

  it('nunca dice "vencido" sobre un pago que el proveedor ya está procesando', () => {
    expect(screenFor({ providerStatus: 'processing', expiresAt: past, now })).toBe('processing');
  });

  it('separa la compra rechazada del código vencido', () => {
    expect(screenFor({ providerStatus: 'failed', expiresAt: past, now })).toBe('failed');
  });

  it('sin respuesta del proveedor decide por el reloj y nada más', () => {
    expect(screenFor({ providerStatus: null, expiresAt: soon, now })).toBe('paying');
    expect(screenFor({ providerStatus: null, expiresAt: past, now })).toBe('expired');
  });

  it('sin vencimiento publicado el código no se da por muerto', () => {
    expect(screenFor({ providerStatus: 'pending', expiresAt: null, now })).toBe('paying');
  });
});

describe('terminalStatusFor', () => {
  it('traduce a estado guardable sólo las pantallas de las que no se vuelve', () => {
    expect(terminalStatusFor('settled')).toBe('settled');
    expect(terminalStatusFor('failed')).toBe('failed');
    expect(terminalStatusFor('expired')).toBe('expired');
    expect(terminalStatusFor('paying')).toBeNull();
    expect(terminalStatusFor('processing')).toBeNull();
  });
});

describe('shouldPoll', () => {
  it('sigue preguntando mientras la compra pueda cambiar sola', () => {
    expect(shouldPoll('paying')).toBe(true);
    expect(shouldPoll('processing')).toBe(true);
    expect(shouldPoll('paying', true)).toBe(true);
  });

  it('sigue preguntando en liquidada mientras falte el hash', () => {
    expect(shouldPoll('settled', false)).toBe(true);
  });

  it('deja de preguntar cuando ya no hay nada que esperar', () => {
    expect(shouldPoll('settled', true)).toBe(false);
    expect(shouldPoll('failed')).toBe(false);
    expect(shouldPoll('expired')).toBe(false);
  });

  it('no espera un hash en las pantallas que no liquidan', () => {
    expect(shouldPoll('failed', false)).toBe(false);
    expect(shouldPoll('expired', false)).toBe(false);
  });
});

describe('receivedUsdcFrom', () => {
  it('cree al proveedor cuando informa el monto en USDC', () => {
    expect(receivedUsdcFrom({ amount: 14.31, currency: 'USDC' }, 14.2)).toBe(14.31);
  });

  it('cae a lo que el ledger acreditó cuando el proveedor informa lo pagado en moneda local', () => {
    expect(receivedUsdcFrom({ amount: 100, currency: 'BOB' }, 14.2)).toBe(14.2);
  });

  it('no inventa un monto cuando no hay ni informe ni lectura del ledger', () => {
    expect(receivedUsdcFrom({ amount: 100, currency: 'BOB' }, null)).toBeNull();
  });
});

describe('resumeActionFor', () => {
  it('sends the user back to the amount step when the code expired unpaid', () => {
    // Vencido y el proveedor confirma que nunca vio un pago: mostrarle el QR
    // muerto sólo lo obliga a apretar "empezar de nuevo" a mano.
    expect(resumeActionFor({ state: 'expired', providerStatus: 'pending' })).toBe('restart');
  });

  it('keeps the expired screen when the provider could not be reached', () => {
    // Sin respuesta no hay confirmación de que nadie pagó, y cerrar a ciegas es
    // cómo una compra acreditada pierde su pantalla de éxito.
    expect(resumeActionFor({ state: 'expired', providerStatus: null })).toBe('resume');
  });

  it('still restores a purchase that got credited after its code expired', () => {
    expect(resumeActionFor({ state: 'expired', providerStatus: 'completed' })).toBe('resume');
  });

  it('leaves a live code alone', () => {
    expect(resumeActionFor({ state: 'pending', providerStatus: 'pending' })).toBe('resume');
  });
});
