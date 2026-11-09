export function truncateMiddle(value: string, head = 6, tail = 4) {
  if (!value) return '';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
/**
 * The short code of an asset, for showing to a person. Stellar names a classic
 * asset in full as `CODE:ISSUER` ("USDC:GA5Z…KZVN", 61 characters), and that is
 * how history and signing records carry it; only the code is meant to be read.
 * The network's own coin comes as "native".
 */
export function assetCode(asset: string) {
  const code = asset.split(':')[0]!.trim();
  return code.toLowerCase() === 'native' ? 'XLM' : code;
}
export const truncateDecimals = (num: number, digits: number) => {
  const factor = Math.pow(10, digits);
  return Math.trunc(num * factor) / factor;
};