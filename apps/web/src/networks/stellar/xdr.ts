export function normalizeSignedXdr(
  res: string | { signedTxXdr: string; signerAddress?: string; signedXDR?: string; signedXdr?: string; xdr?: string },
  isAuth = false
): string {
  if (typeof res === 'string') return res;
  const key = isAuth ? 'signedAuthEntry' : 'signedTxXdr';
  const out = res?.[key as 'signedTxXdr'] ?? res?.signedXDR ?? res?.signedXdr ?? res?.xdr;
  if (typeof out !== 'string') {
    throw new Error('Wallet did not return a base64 XDR string');
  }
  return out;
}
