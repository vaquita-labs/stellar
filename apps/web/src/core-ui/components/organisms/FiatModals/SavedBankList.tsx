'use client';

import { Spinner } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiCheck, FiTrash2 } from 'react-icons/fi';
import type { RampField } from '@/networks/pollar/rampFields';
import type { SavedBankAccount } from '../../../hooks/useSavedBankAccounts';

interface SavedBankListProps {
  accounts: SavedBankAccount[];
  fields: RampField[];
  /** Cuenta cuyos datos están cargados ahora mismo en el formulario. */
  selectedId: string | null;
  loading?: boolean;
  disabled?: boolean;
  deletingId?: string | null;
  onSelect: (account: SavedBankAccount) => void;
  onDelete: (id: string) => void;
}

/**
 * The keys that can summarize an account when there is no schema to say which
 * field was which — the destination was picked before the amount, so no quote
 * has described the form yet. A value that is mostly digits (an account number,
 * a document) is what identifies an account; a holder's name or a bank never is,
 * so those only serve when nothing else is left.
 */
function hintKeys(values: Record<string, string>): string[] {
  const filled = Object.keys(values).filter((key) => (values[key] ?? '').trim().length > 0);
  const identifiers = filled.filter((key) => {
    const value = values[key].trim();
    const digits = (value.match(/\d/g) ?? []).length;
    return digits >= 4 && digits * 2 >= value.length;
  });
  return identifiers.length > 0 ? identifiers : filled;
}

/**
 * Resumen de una cuenta, para poder distinguir dos del mismo banco sin mostrar
 * el número entero.
 *
 * No hay una "columna del número de cuenta": qué campos existen lo decide la
 * cotización. Así que se toma el último campo de texto que tenga valor —en los
 * corredores de hoy es el número de cuenta o la clave de cobro— y se muestran
 * sólo los últimos cuatro caracteres. Si no hay ninguno, no se muestra nada: es
 * preferible a inventar un identificador.
 *
 * Sin cotización no hay tipos que mirar y se cae en {@link hintKeys}, que
 * distingue por la pinta del valor: elegir una cuenta guardada antes del monto
 * es un camino válido y la fila tiene que resumirse igual.
 *
 * Toma el diccionario de valores y no la cuenta entera porque la fila de destino
 * del paso del monto tiene que resumir igual una cuenta guardada que uno tipeado
 * a mano, que todavía no es una fila en ningún lado.
 */
export function accountHint(values: Record<string, string>, fields: RampField[]): string {
  const keys =
    fields.length > 0
      ? fields.filter((f) => f.type !== 'select' && (values[f.key] ?? '').trim().length > 0).map((f) => f.key)
      : hintKeys(values);
  const last = keys[keys.length - 1];
  if (!last) return '';
  const value = values[last].trim();
  return value.length <= 4 ? value : `••••${value.slice(-4)}`;
}

/**
 * Las cuentas bancarias que el usuario ya guardó para este país. Elegir una
 * llena el formulario de abajo; queda visible y editable a propósito, porque lo
 * que el proveedor pide puede haber cambiado desde que se guardó y el usuario
 * tiene que poder ver qué va a mandar antes de confirmar.
 */
export function SavedBankList({
  accounts,
  fields,
  selectedId,
  loading,
  disabled,
  deletingId,
  onSelect,
  onDelete,
}: SavedBankListProps) {
  const { t } = useTranslation();
  // Borrar una cuenta es irreversible y el botón es chico: el primer toque pide
  // confirmación en la misma fila, sin abrir otro modal encima de este flujo.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (loading && accounts.length === 0) {
    return <div className="h-14 rounded-lg border border-black/10 bg-white animate-pulse" />;
  }

  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500">{t('wallet.fiat.ramp.savedBanks.title', 'Your saved accounts')}</p>

      {accounts.map((account) => {
        const selected = account.id === selectedId;
        const confirming = account.id === confirmId;
        const hint = accountHint(account.fields, fields);

        return (
          <div
            key={account.id}
            className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors ${
              selected ? 'border-black border-b-2' : 'border-black/15'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setConfirmId(null);
                onSelect(account);
              }}
              disabled={disabled}
              className="flex flex-1 min-w-0 items-center gap-2.5 text-left disabled:opacity-50"
            >
              {selected ? (
                <FiCheck className="w-5 h-5 text-black shrink-0" strokeWidth={3} />
              ) : (
                <BsBank2 className="w-5 h-5 text-black shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-bold text-black truncate">{account.label}</span>
                {hint ? <span className="block font-mono text-[11px] text-gray-500">{hint}</span> : null}
              </span>
            </button>

            {confirming ? (
              <button
                type="button"
                onClick={() => {
                  setConfirmId(null);
                  onDelete(account.id);
                }}
                disabled={disabled}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {t('wallet.fiat.ramp.savedBanks.confirmDelete', 'Delete?')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(account.id)}
                disabled={disabled}
                aria-label={t('withdraw.deleteWallet.action', 'Delete')}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md text-gray-400 hover:bg-black/5 hover:text-black transition disabled:opacity-50"
              >
                {deletingId === account.id ? <Spinner size="sm" color="current" /> : <FiTrash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
