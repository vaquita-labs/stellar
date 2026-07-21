'use client';

import { AppTransaction, TransactionStatus } from '@/core-ui/helpers/transactions';
import { useTranslation } from 'react-i18next';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';

/**
 * Fila de un movimiento: ícono + concepto/subtítulo a la izquierda y monto +
 * fecha a la derecha. Es una fila de lista (no una tarjeta): las filas viven
 * dentro de un contenedor `TransactionList` con divisores, igual que el centro
 * de notificaciones. Compartida por el modal de Bank Rewards (últimas 3) y la
 * pantalla /transactions.
 */

const STATUS_BADGE: Record<Exclude<TransactionStatus, 'completed'>, string> = {
  pending: 'bg-primary/20 text-black border-black/20',
  failed: 'bg-red-100 text-red-700 border-red-300',
};

export const formatTransactionTime = (timestamp: number, locale: string) =>
  new Date(timestamp).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function TransactionRow({
  transaction,
  onPress,
}: {
  transaction: AppTransaction;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isDeposit = transaction.kind === 'deposit';
  const failed = transaction.status === 'failed';

  const title = isDeposit
    ? t('transactions.kind.deposit', 'Deposit')
    : transaction.early
      ? t('transactions.kind.withdrawEarly', 'Early withdrawal')
      : t('transactions.kind.withdraw', 'Withdrawal');

  const subtitle = isDeposit
    ? t('transactions.row.toSavings', 'To savings')
    : t('transactions.row.toWallet', 'To your wallet');

  const sign = failed ? '' : isDeposit ? '−' : '+';
  const amountColor = failed ? 'text-gray-400 line-through' : isDeposit ? 'text-black' : 'text-success';

  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className={
          'w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ' +
          (onPress ? 'cursor-pointer hover:bg-black/5 active:bg-black/10' : 'cursor-default')
        }
      >
        <span
          className={
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black text-black ' +
            (isDeposit ? 'bg-primary/30' : 'bg-success/25')
          }
        >
          {isDeposit ? <FiArrowDownLeft className="h-4 w-4" /> : <FiArrowUpRight className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-black truncate">{title}</p>
            {transaction.status !== 'completed' && (
              <span
                className={
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ' +
                  STATUS_BADGE[transaction.status]
                }
              >
                {t(`transactions.status.${transaction.status}`)}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 truncate">{subtitle}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold tabular-nums ${amountColor}`}>
            {sign}
            {transaction.amount.toFixed(2)} {transaction.tokenSymbol}
          </p>
          <p className="text-[11px] text-gray-500">{formatTransactionTime(transaction.timestamp, i18n.language)}</p>
        </div>
      </button>
    </li>
  );
}

/** Placeholder con la misma altura y estilo de la fila real, para no saltar al cargar. */
export function TransactionRowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-2 py-2.5">
      <span className="h-9 w-9 shrink-0 rounded-md border border-black/20 bg-default-100 animate-pulse" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3.5 w-24 rounded bg-default-100 animate-pulse" />
        <span className="block h-3 w-16 rounded bg-default-100 animate-pulse" />
      </div>
      <div className="shrink-0 space-y-1.5">
        <span className="block h-3.5 w-20 rounded bg-default-100 animate-pulse" />
        <span className="block h-3 w-14 rounded bg-default-100 animate-pulse ml-auto" />
      </div>
    </li>
  );
}

/** Contenedor de filas: sin divisores, solo aire entre una y otra. */
export function TransactionList({
  children,
  /**
   * `flush`: las filas se alinean con el borde del contenedor padre (resumen del
   * modal, donde comparten margen con el título y el botón). `grouped`: dentro
   * de la tarjeta blanca de un mes, que ya aporta su propio padding.
   */
  align = 'flush',
}: {
  children: React.ReactNode;
  align?: 'flush' | 'grouped';
}) {
  // -mx-2 compensa el px-2 de las filas para que el contenido quede a ras del
  // borde; dentro de una tarjeta el inset es justamente lo que se busca.
  return <ul className={'space-y-0.5' + (align === 'flush' ? ' -mx-2' : '')}>{children}</ul>;
}

/** Tarjeta blanca de un mes: cabecera + sus filas, como una sola pieza. */
export function TransactionMonthCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-2">
      <h2 className="px-2 pt-1 pb-1.5 text-base font-bold text-black">{label}</h2>
      {children}
    </section>
  );
}
