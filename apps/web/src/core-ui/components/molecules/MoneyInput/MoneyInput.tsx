'use client';

import { useNetworkConfigStore } from '@/core-ui/stores';
import { useMemo, useState } from 'react';
import { IoMdSync } from 'react-icons/io';
import { MoneyInputProps, TokenSymbol } from './types';

const TOKEN_RULES: Record<TokenSymbol, { min?: number; max?: number; maxDecimals: number }> = {
  USDC: { min: 1, max: 1_000_000_000, maxDecimals: 6 },
  USDT: { min: 1, max: 1_000_000_000, maxDecimals: 6 },
  ETH: { min: 0.00001, max: 10_000_000_000, maxDecimals: 5 },
  BTC: { min: 0.0000001, max: 100_000_000_000, maxDecimals: 6 },
};

function buildRegex(maxDecimals: number) {
  return new RegExp(`^(?:0|[1-9]\\d*)(?:\\.(\\d{0,${maxDecimals}}))?$`);
}

function sanitizeRaw(raw: string) {
  let v = raw.replace(/\s+/g, '').replace(',', '.');
  if (v.startsWith('.')) v = '0' + v;
  if (/^0+\d/.test(v)) {
    v = v.replace(/^0+/, '');
    if (v === '' || v.startsWith('.')) v = '0' + v;
  }
  return v;
}

export function MoneyInput({
  loading,
  value,
  onValueChange,
  onTokenChange,
  cap = 9_999_999_999_999,
  balanceFormatted = '0',
  onReloadBalance,
  balanceIsLoading,
}: MoneyInputProps) {
  const { token, network } = useNetworkConfigStore();
  const tokenSymbols = network?.tokens ?? [];

  const rules = (token && TOKEN_RULES[token?.symbol as TokenSymbol]) ?? { min: 0, max: 0, maxDecimals: 0 };
  const rx = useMemo(() => buildRegex(rules.maxDecimals), [rules.maxDecimals]);

  const [error, setError] = useState<string | null>(null);

  const validate = (next: string) => {
    if (next === '') return null;
    if (!rx.test(next)) return `Max ${rules.maxDecimals} decimals`;

    const n = Number(next);
    if (!Number.isFinite(n)) return 'Invalid number';

    if (rules.min !== undefined && n < rules.min) {
      return `Min ${rules.min}`;
    }

    if (rules.max !== undefined && n > rules.max) {
      return `Max ${rules.max.toLocaleString()}`;
    }

    if (n > cap) return `Max ${cap.toLocaleString()}`;

    return null;
  };

  const handleChange = (raw: string) => {
    const sanitized = sanitizeRaw(raw);

    if (sanitized === '') {
      onValueChange(sanitized);
      setError(null);
      return;
    }
    if (!rx.test(sanitized)) {
      return;
    }

    onValueChange(sanitized);
    setError(validate(sanitized));
  };

  const normalizeOnBlur = () => {
    if (!value) return;
    let v = value;

    const [intPart, decPart = ''] = v.split('.');
    const trimmedDec = decPart.slice(0, rules.maxDecimals);
    v = trimmedDec ? `${intPart}.${trimmedDec}` : intPart;

    const numValue = Number(v);

    if (rules.min !== undefined && numValue < rules.min) {
      v = String(rules.min);
    }

    if (rules.max !== undefined && numValue > rules.max) {
      v = String(rules.max);
    } else if (numValue > cap) {
      v = String(cap);
    }

    if (v.endsWith('.')) v = v.slice(0, -1);

    if (v.includes('.')) v = v.replace(/\.?0+$/, '');

    onValueChange(v);
    setError(validate(v));
  };

  const preventKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div className="flex flex-col gap-1 mb-2">
      <label className="text-black font-normal text-sm">Amount to deposit</label>
      <div className={`flex items-center bg-white border border-black border-b-2 h-14 rounded-md px-3 ${error ? 'border-danger' : ''}`}>
        <input
          disabled={loading}
          placeholder="0.0"
          value={value}
          className="flex-1 min-w-0 text-black font-medium bg-transparent border-0 outline-none h-full text-base placeholder:text-default-400"
          onChange={(e) => handleChange(e.target.value)}
          onBlur={normalizeOnBlur}
          onKeyDown={preventKeys}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]*"
        />
        <label className="sr-only" htmlFor="currency">Currency</label>
        <select
          value={token?.symbol}
          className="h-full bg-transparent border-0 outline-none text-black font-medium text-sm pl-2"
          id="currency"
          name="currency"
          onChange={(e) => {
            const tok = tokenSymbols.find((t) => t.symbol === e.target.value);
            if (tok) onTokenChange(tok);
            setTimeout(() => setError(validate(value)), 0);
          }}
        >
          {tokenSymbols.map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-danger text-xs">{error}</span>}
      <span className="text-xs text-default-400">
        Total balance: ${balanceFormatted}{' '}
        <IoMdSync
          className={`inline h-4 w-4 cursor-pointer text-gray-500 hover:text-black transition ${
            balanceIsLoading ? 'animate-spin text-black' : ''
          }`}
          onClick={!balanceIsLoading ? onReloadBalance : undefined}
        />
      </span>
    </div>
  );
}
