'use client';

import { useNetworkConfigStore } from '@/core-ui/stores';
import { Input } from '@heroui/react';
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
  // ^(0|[1-9]\d*)(\.\d{0,maxDecimals})?$
  return new RegExp(`^(?:0|[1-9]\\d*)(?:\\.(\\d{0,${maxDecimals}}))?$`);
}

function sanitizeRaw(raw: string) {
  // Quita espacios, normaliza coma a punto y elimina ceros a izquierda tipo "0001" -> "1"
  let v = raw.replace(/\s+/g, '').replace(',', '.');
  if (v.startsWith('.')) v = '0' + v;
  // Permite "0" o "0.xxx"; evita "00..."
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
    // TODO: add validation for btc and eth
    if (next === '') return null; // permitir vacío mientras escribe
    if (!rx.test(next)) return `Max ${rules.maxDecimals} decimals`;

    const n = Number(next);
    if (!Number.isFinite(n)) return 'Invalid number';

    // validar mínimo
    if (rules.min !== undefined && n < rules.min) {
      return `Min ${rules.min}`;
    }

    // validar máximo específico del token
    if (rules.max !== undefined && n > rules.max) {
      return `Max ${rules.max.toLocaleString()}`;
    }

    // cap superior general (fallback)
    if (n > cap) return `Max ${cap.toLocaleString()}`;

    return null;
  };

  const handleChange = (raw: string) => {
    const sanitized = sanitizeRaw(raw);

    // Siempre permitir vacío
    if (sanitized === '') {
      onValueChange(sanitized);
      setError(null);
      return;
    }
    // Validar formato básico con la regex
    if (!rx.test(sanitized)) {
      return; // Bloquear si no cumple el formato de decimales
    }
    // Si está escribiendo y termina en punto, permitir (ej: "23.")
    const isTypingDecimal = sanitized.endsWith('.');
    // Solo validar máximo si NO está escribiendo el punto (para permitir "23." antes de "23.2")

    // Actualizar valor y validar
    onValueChange(sanitized);
    setError(validate(sanitized));
  };

  const normalizeOnBlur = () => {
    if (!value) return;
    let v = value;

    // cortar decimales extra si los hubiera
    const [intPart, decPart = ''] = v.split('.');
    const trimmedDec = decPart.slice(0, rules.maxDecimals);
    v = trimmedDec ? `${intPart}.${trimmedDec}` : intPart;

    const numValue = Number(v);

    // aplicar mínimo
    if (rules.min !== undefined && numValue < rules.min) {
      v = String(rules.min);
    }

    // aplicar máximo específico del token
    if (rules.max !== undefined && numValue > rules.max) {
      v = String(rules.max);
    } else if (numValue > cap) {
      // aplicar cap general (fallback)
      v = String(cap);
    }

    // quitar punto final colgante ("12." -> "12")
    if (v.endsWith('.')) v = v.slice(0, -1);

    // quitar ceros decimales de más ("1.230000" -> "1.23")
    if (v.includes('.')) v = v.replace(/\.?0+$/, '');

    onValueChange(v);
    setError(validate(v));
  };

  const preventKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Bloquear caracteres no deseados (coma se permite porque sanitizeRaw la convierte a punto)
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <Input
      disabled={loading}
      label="Amount to deposit"
      placeholder="0.0"
      value={value}
      isInvalid={!!error}
      errorMessage={error ?? undefined}
      classNames={{
        inputWrapper: 'bg-white border border-black border-b-2 h-14',
        label: 'text-black font-normal text-sm',
        input: 'text-black font-medium',
      }}
      description={
        <span>
          Total balance: ${balanceFormatted}{' '}
          <IoMdSync
            className={`inline h-4 w-4 cursor-pointer text-gray-500 hover:text-black transition ${
              balanceIsLoading ? 'animate-spin text-black' : ''
            }`}
            onClick={!balanceIsLoading ? onReloadBalance : undefined}
          />
        </span>
      }
      onChange={(e) => handleChange(e.target.value)}
      onBlur={normalizeOnBlur}
      onKeyDown={preventKeys}
      type="text" // evita problemas del input number (e/E, redondeos, 0.00)
      inputMode="decimal" // teclado numérico en móviles
      pattern="[0-9]*[.]?[0-9]*" // pista para navegadores móviles
      endContent={
        <div className="flex items-center h-full">
          <label className="sr-only" htmlFor="currency">
            Currency
          </label>
          <select
            value={token?.symbol}
            className="outline-solid outline-transparent border-0 bg-transparent text-default-400 text-small"
            id="currency"
            name="currency"
            onChange={(e) => {
              const token = tokenSymbols.find((t) => t.symbol === e.target.value);
              if (token) onTokenChange(token);
              // al cambiar token, revalida con nuevas reglas
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
      }
    />
  );
}
