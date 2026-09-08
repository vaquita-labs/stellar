import { describe, expect, it } from 'vitest';

import { formatElapsed, WAITING_PHASE } from './BridgeModal';

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [1_000, '0:01'],
    [59_000, '0:59'],
    [60_000, '1:00'],
    // El caso real: ~7m52s de la primera transferencia en prod.
    [472_000, '7:52'],
    [3_599_000, '59:59'],
    // A partir de la hora agrega el campo, con los minutos ya rellenados.
    [3_600_000, '1:00:00'],
    [3_661_000, '1:01:01'],
  ])('formatea %i ms como %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  // El reloj se arma con `Date.now() - createdTimestamp`: si el reloj del
  // cliente está atrasado respecto del server, la resta da negativa. Mostrar
  // "-1:-01" sería peor que mostrar 0:00.
  it('lleva a cero un transcurrido negativo', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});

describe('WAITING_PHASE', () => {
  // La razón de ser de la tabla: los tres estados de espera son fases
  // distintas y cada una dice algo distinto sobre quién tiene la pelota.
  it.each(['PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING'])('cubre %s', (status) => {
    expect(WAITING_PHASE[status]?.key).toBeTruthy();
  });

  it('da un mensaje distinto para cada fase', () => {
    const keys = Object.values(WAITING_PHASE).map((phase) => phase.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // La regresión que hay que cuidar: `INCOMPLETE_DEPOSIT` NO es una espera.
  // Estaba en la vieja lista `AWAITING` y por eso un depósito corto se veía
  // igual que uno en curso, con un spinner que nunca iba a terminar.
  it('deja INCOMPLETE_DEPOSIT afuera: pide acción, no espera', () => {
    expect(WAITING_PHASE.INCOMPLETE_DEPOSIT).toBeUndefined();
  });

  // Los terminales tampoco: tienen pantalla propia.
  it.each(['SUCCESS', 'REFUNDED', 'FAILED'])('deja %s afuera', (status) => {
    expect(WAITING_PHASE[status]).toBeUndefined();
  });
});
