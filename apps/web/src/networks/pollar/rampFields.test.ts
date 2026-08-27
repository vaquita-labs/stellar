import { describe, expect, it } from 'vitest';
import { RampError } from './ramps';
import { fieldsAreValid, placeholderFor, rampErrorMessage, type RampField } from './rampFields';

const field = (over: Partial<RampField> = {}): RampField => ({ key: 'taxId', label: 'CI', type: 'text', ...over }) as RampField;

describe('fieldsAreValid', () => {
  it('blocks continuing while a required field is empty', () => {
    const fields = [field()];
    expect(fieldsAreValid(fields, {})).toBe(false);
    expect(fieldsAreValid(fields, { taxId: '  ' })).toBe(false);
    expect(fieldsAreValid(fields, { taxId: '1234567' })).toBe(true);
  });

  it('lets an optional field stay empty but still checks it once filled', () => {
    const fields = [field({ key: 'email', type: 'email', optional: true })];
    expect(fieldsAreValid(fields, {})).toBe(true);
    expect(fieldsAreValid(fields, { email: 'not-an-email' })).toBe(false);
    expect(fieldsAreValid(fields, { email: 'ana@example.bo' })).toBe(true);
  });
});

describe('placeholderFor', () => {
  const bank = field({ key: 'bank', type: 'select', label: 'Banco' }) as RampField & {
    options?: { value: string; label: string; placeholder?: string }[];
  };

  it('shows the example that matches the option chosen in another field', () => {
    const account = field({ key: 'account', label: 'Cuenta', placeholderFrom: 'bank' });
    const withOptions = {
      ...bank,
      options: [
        { value: 'bnb', label: 'Banco Nacional', placeholder: '1234567890' },
        { value: 'bcp', label: 'Banco de Credito', placeholder: 'BCP-000-111' },
      ],
    } as RampField;
    const fields = [withOptions, account];

    expect(placeholderFor(account, fields, { bank: 'bcp' })).toBe('BCP-000-111');
  });

  it('falls back to the field label when nothing else says what to type', () => {
    const account = field({ key: 'account', label: 'Cuenta', placeholderFrom: 'bank' });
    expect(placeholderFor(account, [bank, account], {})).toBe('Cuenta');
    expect(placeholderFor(field({ placeholder: '7 digitos' }), [], {})).toBe('7 digitos');
  });
});

describe('rampErrorMessage', () => {
  const translate = (key: string) => `translated:${key}`;

  it('uses our own wording for the provider codes we have a message for', () => {
    const expired = new RampError('quote expired', 'SDK_RAMPS_QUOTE_EXPIRED');
    expect(rampErrorMessage(expired, translate, 'fallback')).toBe('translated:quoteExpired');
  });

  it('passes through the provider text for a code we do not recognise', () => {
    const unknown = new RampError('the anchor is on holiday', 'SDK_RAMPS_SOMETHING_NEW');
    expect(rampErrorMessage(unknown, translate, 'fallback')).toBe('the anchor is on holiday');
  });

  it('falls back to our generic wording when the failure says nothing at all', () => {
    expect(rampErrorMessage({}, translate, 'fallback')).toBe('fallback');
    expect(rampErrorMessage(new Error(''), translate, 'fallback')).toBe('fallback');
  });
});
