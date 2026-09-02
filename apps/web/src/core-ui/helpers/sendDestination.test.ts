import { describe, expect, it } from 'vitest';
import { nicknameSegment } from './nickname';
import { classifyDestination } from './sendDestination';

// Una G… real de mainnet (la usada como tenedor en la sonda del vault).
const ADDRESS = 'GAOWFEGRSBIQV3UCZPRPUQO25TUUFZLKNCHR6XMBCFMLLBJYINOYVI5J';

describe('nicknameSegment', () => {
  it('saca el @ que la API no acepta', () => {
    expect(nicknameSegment('@juan')).toBe('juan');
    expect(nicknameSegment('  @Juan  ')).toBe('juan');
    expect(nicknameSegment('juan')).toBe('juan');
  });

  it('normaliza igual que el resto de la app', () => {
    expect(nicknameSegment('@Juan Pérez!')).toBe('juanperez');
  });

  it('devuelve vacío cuando no queda nada usable', () => {
    expect(nicknameSegment('@')).toBe('');
    expect(nicknameSegment('   ')).toBe('');
  });
});

describe('classifyDestination', () => {
  it('reconoce una dirección Stellar', () => {
    expect(classifyDestination(ADDRESS)).toEqual({ kind: 'address', value: ADDRESS });
    expect(classifyDestination(`  ${ADDRESS}  `)).toEqual({ kind: 'address', value: ADDRESS });
  });

  it('reconoce un @usuario y devuelve el segmento sin @', () => {
    expect(classifyDestination('@juan')).toEqual({ kind: 'handle', value: 'juan' });
  });

  // El punto de clasificar por el @ explícito: una dirección mal tipeada tiene
  // que decir "dirección inválida" y no mandar a buscar un usuario.
  it('trata una dirección mal tipeada como inválida, no como usuario', () => {
    expect(classifyDestination(ADDRESS.slice(0, -1))).toEqual({ kind: 'invalid' });
    expect(classifyDestination('juan')).toEqual({ kind: 'invalid' });
  });

  it('distingue vacío de inválido', () => {
    expect(classifyDestination('')).toEqual({ kind: 'empty' });
    expect(classifyDestination('   ')).toEqual({ kind: 'empty' });
    expect(classifyDestination('@')).toEqual({ kind: 'invalid' });
  });
});
