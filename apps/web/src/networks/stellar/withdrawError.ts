import i18n from '@/core-ui/i18n';

/**
 * El retiro a otro usuario sacó la plata de Blend pero no llegó a pagarla.
 *
 * Los dos saltos no son atómicos, y entre uno y otro la plata queda en la wallet
 * del que retira. Un error genérico ahí ("no pudimos completar la transacción")
 * describe mal el estado: da a entender que nada se movió y que sigue rindiendo,
 * cuando en realidad ya salió. Este error existe para decir dónde quedó y cómo
 * seguir — el envío se reintenta desde Wallet → Enviar, que hace exactamente
 * este mismo pago sin volver a tocar Blend.
 *
 * `cause` conserva el error original del pago para logs y telemetría.
 */
export class WithdrawPaymentError extends Error {
  readonly i18nKey = 'txError.withdrawPaymentLeg';
  readonly fallback =
    'Your money is out of savings and in your wallet, but the payment to {{destination}} did not go through. ' +
    'You can send it from Wallet → Send.';
  /** Etiqueta del destino al que se le iba a pagar (`@usuario` o el alias). */
  readonly destination: string;
  /** El texto original del error del pago, para logs y "ver detalles". */
  readonly raw: string;

  constructor(destination: string, cause: unknown) {
    const fallback =
      'Your money is out of savings and in your wallet, but the payment to {{destination}} did not go through. ' +
      'You can send it from Wallet → Send.';
    super(i18n.t('txError.withdrawPaymentLeg', fallback, { destination }), { cause });
    this.name = 'WithdrawPaymentError';
    this.destination = destination;
    this.raw = cause instanceof Error ? cause.message : String(cause ?? '');
  }
}

/** True cuando el retiro falló DESPUÉS de sacar la plata de Blend. */
export const isWithdrawPaymentError = (error: unknown): error is WithdrawPaymentError => error instanceof WithdrawPaymentError;
