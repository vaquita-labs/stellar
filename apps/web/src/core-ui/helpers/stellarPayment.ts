/**
 * The payment a QR carries, for paying by QR: a bare Stellar address, or a
 * SEP-7 `web+stellar:pay` link with the destination and, when the payee set
 * them, the amount and the memo.
 */
export interface StellarPaymentRequest {
  destination: string;
  amount?: string;
  memo?: string;
}

const ADDRESS = /G[A-Z2-7]{55}/;
const EXACT_ADDRESS = /^G[A-Z2-7]{55}$/;
const AMOUNT = /^\d+(\.\d+)?$/;

/** The payment in a scanned payload, or null when it holds no Stellar destination. */
export function parseStellarPayment(payload: string): StellarPaymentRequest | null {
  const text = payload.trim();
  if (!text) return null;
  if (EXACT_ADDRESS.test(text.toUpperCase())) return { destination: text.toUpperCase() };

  // SEP-7: web+stellar:pay?destination=G...&amount=1.5&memo=hello
  const sep7 = /^web\+stellar:pay\?(.*)$/i.exec(text);
  if (sep7) {
    const params = new URLSearchParams(sep7[1] ?? '');
    const destination = (params.get('destination') ?? '').toUpperCase();
    if (!EXACT_ADDRESS.test(destination)) return null;
    const amount = params.get('amount') ?? undefined;
    const memo = params.get('memo') ?? undefined;
    return {
      destination,
      ...(amount && AMOUNT.test(amount) && Number(amount) > 0 ? { amount } : {}),
      ...(memo ? { memo } : {}),
    };
  }

  // Anything else that carries an address somewhere (a link, a JSON blob).
  const found = ADDRESS.exec(text.toUpperCase());
  return found ? { destination: found[0] } : null;
}

/**
 * The QR to show to be paid: the bare address when nothing else is asked
 * (every wallet and exchange reads that), the SEP-7 link once an amount is
 * set, so a wallet that understands it fills the form in.
 */
export function buildPaymentQr(
  destination: string,
  options: { amount?: string; assetCode?: string; assetIssuer?: string | null } = {},
): string {
  const amount = options.amount?.trim() ?? '';
  if (!amount || !AMOUNT.test(amount) || Number(amount) <= 0) return destination;
  const params = new URLSearchParams({ destination, amount });
  if (options.assetCode && options.assetIssuer) {
    params.set('asset_code', options.assetCode);
    params.set('asset_issuer', options.assetIssuer);
  }
  return `web+stellar:pay?${params.toString()}`;
}
