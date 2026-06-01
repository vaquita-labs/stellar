export function truncateMiddle(value: string, head = 6, tail = 4) {
  if (!value) return '';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
export const truncateDecimals = (num: number, digits: number) => {
  const factor = Math.pow(10, digits);
  return Math.trunc(num * factor) / factor;
};