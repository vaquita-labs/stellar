export function isHex32(str: string) {
  return /^[0-9a-fA-F]{32}$/.test(str);
}

export async function toHexFromAny(input: number, size: number): Promise<string> {
  const data = new TextEncoder().encode(input + '');
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const bytes = new Uint8Array(digest).slice(0, size / 2);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const formatAmount = (amount: number, tokenSymbol: string) => {
  return `${amount.toFixed(2)} ${tokenSymbol}`;
};

/**
 * Monto en dólares con separador de miles: $3,806.22. Los saldos del portfolio
 * pueden tener cuatro cifras o más y sin separador se leen mal de un vistazo.
 */
export const formatUsd = (amount: number) =>
  `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
