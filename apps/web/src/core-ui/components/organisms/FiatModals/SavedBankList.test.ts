import { describe, expect, it } from 'vitest';
import { accountHint } from './SavedBankList';
import type { RampField } from '@/networks/pollar/rampFields';

const BOLIVIA_FIELDS: RampField[] = [
  { key: 'bankAccountNumber', label: 'Bank account number', type: 'text' },
  { key: 'bank', label: 'Bank', type: 'select', options: [{ value: 'YOLO', label: 'YOLO PAGO' }] },
  { key: 'accountHolderName', label: 'Account holder name', type: 'text' },
  { key: 'ci', label: 'Account holder CI', type: 'text' },
];

const BOLIVIA_VALUES = {
  bankAccountNumber: '1234567890',
  bank: 'YOLO',
  accountHolderName: 'Oscar Gauss',
  ci: '9876543',
};

describe('accountHint', () => {
  it('masks the last filled text field the quote describes', () => {
    expect(accountHint(BOLIVIA_VALUES, BOLIVIA_FIELDS)).toBe('••••6543');
  });

  it('shows short values whole, since there is nothing to hide', () => {
    expect(accountHint({ ci: '812' }, [{ key: 'ci', label: 'CI', type: 'text' }])).toBe('812');
  });

  it('ignores selects: the bank is not what tells two accounts apart', () => {
    const onlyBank = { bank: 'YOLO', accountHolderName: '' };
    expect(accountHint(onlyBank, BOLIVIA_FIELDS)).toBe('');
  });

  // Sin cotización —el destino se eligió antes del monto— no hay tipos que
  // mirar y el resumen se decide por la pinta del valor.
  it('prefers a digit-heavy value when there is no schema', () => {
    expect(accountHint(BOLIVIA_VALUES, [])).toBe('••••6543');
  });

  it('falls back to the last filled value when none looks like an identifier', () => {
    expect(accountHint({ bank: 'YOLO PAGO', accountHolderName: 'Oscar Gauss' }, [])).toBe('••••auss');
  });

  it('says nothing when there is nothing to summarize', () => {
    expect(accountHint({}, [])).toBe('');
    expect(accountHint({}, BOLIVIA_FIELDS)).toBe('');
  });
});
